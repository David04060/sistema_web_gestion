import type { PoolClient } from 'pg';
import type { ActorDocumental } from '../../shared/documental/transaccion.js';
import { contenidoAutorizadoSQL } from '../documentos/documentos.repository.js';
import type { Dashboard, Indicador } from './dashboard.types.js';
/** Metadatos del panel leídos con la misma conexión e instantánea que sus contadores. */
export async function contexto(c: PoolClient, oficinaId: string | null) {
    return (await c.query<{
        oficina: string | null;
        fecha: string;
    }>(`
        SELECT (SELECT nombre FROM oficinas WHERE id=$1::bigint) oficina,
        to_jsonb(transaction_timestamp())#>>'{}' fecha`, [oficinaId])).rows[0]!;
}
/** Solo catálogos administrativos; no consulta documentos ni acceso restringido. */
export async function administracion(c: PoolClient): Promise<Indicador[]> {
    const { rows } = await c.query<{
        usuarios: number;
        activos: number;
        inactivos: number;
        oficinas: number;
        roles: number;
        tipos: number;
    }>(`SELECT
    (SELECT count(*)::int FROM usuarios) usuarios,
    (SELECT count(*)::int FROM usuarios WHERE activo) activos,
    (SELECT count(*)::int FROM usuarios WHERE NOT activo) inactivos,
    (SELECT count(*)::int FROM oficinas) oficinas,
    (SELECT count(*)::int FROM roles) roles,
    (SELECT count(*)::int FROM tipos_documentales) tipos`);
    const r = rows[0]!;
    return [['usuarios', 'Usuarios', r.usuarios], ['activos', 'Usuarios activos', r.activos], ['inactivos', 'Usuarios inactivos', r.inactivos], ['oficinas', 'Oficinas', r.oficinas], ['roles', 'Roles', r.roles], ['tipos', 'Tipos documentales', r.tipos]].map(/** Adapta cada contador administrativo a su clave, etiqueta y total numérico del contrato. */ ([clave, etiqueta, total]) => ({ clave: String(clave), etiqueta: String(etiqueta), total: Number(total) }));
}
/** Proyecta situaciones vigentes y fechas del flujo actual sin modificar la historia de circulación. */
export async function documental(c: PoolClient, actor: ActorDocumental) {
    const institucional = ['Director(a)', 'Secretaria de Dirección'].includes(actor.rol);
    return (await c.query<Pick<Dashboard, 'indicadores' | 'estados' | 'operaciones' | 'recientes' | 'pendientes'>>(`
    WITH contenido AS (
      SELECT d.*,coalesce(f.situacion,CASE WHEN p.documento_id IS NOT NULL THEN 'DELEGADO' ELSE 'SIN_DELEGACION' END) situacion,
        greatest(d.fecha_modificacion,f.asignado_en,f.confirmado_en,p.registrada_en) actividad
      FROM documentos d JOIN tipos_documentales td ON td.id=d.tipo_documental_id
      LEFT JOIN entregas_secretaria f ON f.documento_id=d.id
      LEFT JOIN delegaciones_personales p ON p.documento_id=d.id
      WHERE NOT td.requiere_clave AND ${contenidoAutorizadoSQL()}
    ), tareas AS (
      SELECT * FROM contenido WHERE activo AND (
        ($3::boolean AND situacion='PENDIENTE_DECISION') OR ($4::boolean AND situacion='DELEGADO'))
    )
    SELECT jsonb_build_array(
      jsonb_build_object('clave','documentos','etiqueta','Documentos ordinarios consultables','total',(SELECT count(*) FROM contenido)),
      jsonb_build_object('clave','responsabilidad','etiqueta','Bajo mi responsabilidad','total',(SELECT count(*) FROM contenido WHERE activo AND responsable_actual_id=$1)),
      jsonb_build_object('clave','registrados','etiqueta','Registrados por mí consultables','total',(SELECT count(*) FROM contenido WHERE registrado_por_id=$1)),
      jsonb_build_object('clave','delegados','etiqueta','Delegados vigentes','total',(SELECT count(*) FROM contenido WHERE activo AND situacion='DELEGADO'))
    ) indicadores,
    (SELECT jsonb_agg(jsonb_build_object('clave',s.estado,'etiqueta',s.estado,'total',(SELECT count(*) FROM contenido WHERE situacion=s.estado)))
      FROM unnest($5::text[]) s(estado)) estados,
    CASE WHEN $3::boolean THEN jsonb_build_array(
      jsonb_build_object('clave','decision','etiqueta','Pendientes de decisión','total',(SELECT count(*) FROM tareas WHERE situacion='PENDIENTE_DECISION'))
    ) ELSE '[]'::jsonb END || CASE WHEN $4::boolean THEN jsonb_build_array(
      jsonb_build_object('clave','entrega','etiqueta','Pendientes de confirmar entrega','total',(SELECT count(*) FROM tareas WHERE situacion='DELEGADO'))
    ) ELSE '[]'::jsonb END operaciones,
    coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (
      SELECT id::text,codigo,situacion estado,clasificacion_registro,activo,to_jsonb(actividad)#>>'{}' fecha,'/documentos/'||id ruta
      FROM contenido ORDER BY actividad DESC,id DESC LIMIT 8) r),'[]') recientes,
    coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM (
      SELECT id::text,codigo,situacion estado,clasificacion_registro,activo,to_jsonb(actividad)#>>'{}' fecha,'/documentos/'||id ruta
      FROM tareas ORDER BY actividad DESC,id DESC LIMIT 8) p),'[]') pendientes
    `, [actor.id,actor.rol==='Director(a)',institucional,actor.rol==='Secretaria de Dirección',
        institucional ? ['PENDIENTE_DECISION','DELEGADO','ENTREGADO','GUARDADO_DIRECCION','GUARDADO_SECRETARIA'] : ['SIN_DELEGACION','DELEGADO']])).rows[0]!;
}

/** Total y ocho registros de la tarea vigente, calculados por SQL bajo el permiso documental. */
export async function atencion(c:PoolClient,actor:ActorDocumental):Promise<Dashboard['atencion']> {
    if(!['Director(a)','Secretaria de Dirección'].includes(actor.rol))return null;
    const direccion=actor.rol==='Director(a)';
    const resultado=(await c.query(`WITH pendientes AS (
        SELECT d.id,d.codigo,d.asunto,td.nombre tipo_documental,f.destinatario,f.situacion estado,d.fecha_creacion fecha
        FROM documentos d JOIN tipos_documentales td ON td.id=d.tipo_documental_id
        JOIN entregas_secretaria f ON f.documento_id=d.id
        JOIN usuarios u ON u.id=d.registrado_por_id JOIN roles r ON r.id=u.rol_id
        WHERE ${contenidoAutorizadoSQL()} AND d.activo
        AND f.situacion=$3 AND (($2::boolean AND r.nombre='Secretaria de Dirección') OR (NOT $2::boolean AND (r.nombre='Director(a)' OR (r.nombre='Secretaria de Dirección' AND d.registrado_por_id=$1::bigint))))
    ) SELECT (SELECT count(*)::int FROM pendientes) total,
      coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM (
        SELECT id::text,codigo,asunto,tipo_documental,destinatario,estado,to_jsonb(fecha)#>>'{}' fecha,'/documentos/'||id ruta
        FROM pendientes ORDER BY fecha,id LIMIT 8
      ) p),'[]'::jsonb) documentos`,[actor.id,direccion,direccion?'PENDIENTE_DECISION':'DELEGADO'])).rows[0];
    return {titulo:direccion?'Documentos de Secretaría pendientes de decisión':'Delegados pendientes de confirmar entrega',
        situacion:direccion?'PENDIENTE_DECISION':'DELEGADO',...resultado};
}
