import type { PoolClient } from 'pg';
import type { ActorDocumental } from '../../shared/documental/transaccion.js';
import { contenidoAutorizadoSQL, recorridoAutorizadoSQL } from '../documentos/documentos.repository.js';
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
/**
 * Una instantánea agrega contenido y recorrido con sus permisos respectivos.
 * La exclusión ordinaria explícita permanece incluso si existe contexto SíseVe.
 * Los pendientes representan operaciones, nunca estados documentales nuevos.
 */
export async function documental(c: PoolClient, actor: ActorDocumental, mesa: boolean) {
    return (await c.query<Pick<Dashboard, 'indicadores' | 'estados' | 'operaciones' | 'recientes' | 'pendientes'>>(`
    WITH contenido AS (
      SELECT d.* FROM documentos d JOIN tipos_documentales td ON td.id=d.tipo_documental_id
      WHERE NOT td.requiere_clave AND lower(btrim(td.nombre))<>'síseve' AND ${contenidoAutorizadoSQL()}
    ), recorrido AS (
      SELECT m.*,d.codigo FROM movimientos_documentales m JOIN documentos d ON d.id=m.documento_id
      JOIN tipos_documentales td ON td.id=d.tipo_documental_id
      WHERE NOT td.requiere_clave AND lower(btrim(td.nombre))<>'síseve' AND ${recorridoAutorizadoSQL()}
    ), tareas AS (
      SELECT d.id,d.codigo,'/documentos/'||d.id ruta,d.estado_tramite estado,d.fecha_modificacion fecha
      FROM contenido d WHERE d.activo AND d.estado_tramite='PENDIENTE_DECISION'
      AND (($2 AND d.destinatario_autorizado_id IS NULL) OR (d.responsable_actual_id=$1 AND d.destinatario_autorizado_id IS NOT NULL))
      UNION ALL
      SELECT m.id,m.codigo,'/movimientos/'||m.id,m.estado,m.fecha_modificacion FROM recorrido m
      WHERE (m.estado='EN_TRASLADO' AND m.usuario_destino_id=$1)
         OR (m.estado='RECHAZADO' AND m.usuario_origen_id=$1 AND m.devolucion_confirmada_por_id IS NULL)
      UNION ALL
      SELECT d.id,d.codigo,'/documentos/'||d.id,d.estado_tramite,d.fecha_modificacion FROM contenido d
      WHERE $3 AND d.activo AND d.responsable_actual_id=$1 AND d.estado_tramite='RECIBIDO'
    )
    SELECT
    jsonb_build_array(
      jsonb_build_object('clave','documentos','etiqueta','Documentos ordinarios consultables','total',(SELECT count(*) FROM contenido)),
      jsonb_build_object('clave','responsabilidad','etiqueta','Bajo mi responsabilidad','total',(SELECT count(*) FROM contenido WHERE activo AND responsable_actual_id=$1)),
      jsonb_build_object('clave','registrados','etiqueta','Registrados por mí consultables','total',(SELECT count(*) FROM contenido WHERE registrado_por_id=$1)),
      jsonb_build_object('clave','enviados','etiqueta','Documentos enviados por mí','total',(SELECT count(DISTINCT documento_id) FROM recorrido WHERE usuario_origen_id=$1))
    ) indicadores,
    (SELECT jsonb_agg(jsonb_build_object('clave',s.estado,'etiqueta',s.estado,'total',(SELECT count(*) FROM contenido WHERE estado_tramite=s.estado)))
      FROM unnest(ARRAY['PENDIENTE_DECISION','EN_TRASLADO','RECIBIDO','RECHAZADO','CANCELADO']) s(estado)) estados,
    jsonb_build_array(
      jsonb_build_object('clave','decision','etiqueta','Pendientes de decisión','total',(SELECT count(*) FROM contenido WHERE activo AND estado_tramite='PENDIENTE_DECISION' AND destinatario_autorizado_id IS NULL)),
      jsonb_build_object('clave','salida','etiqueta','Autorizados en espera de salida física','total',(SELECT count(*) FROM contenido WHERE activo AND estado_tramite='PENDIENTE_DECISION' AND destinatario_autorizado_id IS NOT NULL)),
      jsonb_build_object('clave','recepcion','etiqueta','Mis recepciones pendientes','total',(SELECT count(*) FROM recorrido WHERE estado='EN_TRASLADO' AND usuario_destino_id=$1)),
      jsonb_build_object('clave','recuperacion','etiqueta','Mis recuperaciones físicas pendientes','total',(SELECT count(*) FROM recorrido WHERE estado='RECHAZADO' AND usuario_origen_id=$1 AND devolucion_confirmada_por_id IS NULL)),
      jsonb_build_object('clave','solicitar','etiqueta','Recibidos para solicitar decisión','total',(SELECT count(*) FROM contenido WHERE $3 AND activo AND estado_tramite='RECIBIDO' AND responsable_actual_id=$1))
    ) operaciones,
    coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT id::text,codigo,estado_tramite estado,to_jsonb(fecha_modificacion)#>>'{}' fecha,'/documentos/'||id ruta FROM contenido ORDER BY fecha_modificacion DESC,id DESC LIMIT 8) r),'[]') recientes,
    coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM (SELECT id::text,codigo,estado,to_jsonb(fecha)#>>'{}' fecha,ruta FROM tareas ORDER BY fecha DESC,ruta LIMIT 8) p),'[]') pendientes
  `, [actor.id, actor.rol === 'Director(a)', mesa])).rows[0]!;
}
