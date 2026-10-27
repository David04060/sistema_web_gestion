import type { PoolClient } from 'pg';
import { env } from '../../config/env.js';
import { clienteDocumental } from '../../shared/documental/contexto.js';
import type { ActorDocumental } from '../../shared/documental/transaccion.js';
import { consultar } from '../documentos/pertenencia.repository.js';
import { contenidoAutorizadoSQL } from '../documentos/documentos.repository.js';
import type { Presentacion } from './ingresos.schema.js';
import { HttpError } from '../../shared/http/HttpError.js';

export const habilitado = () => env.PRIMER_INGRESO_ORDINARIO_HABILITADO && !clienteDocumental();
export const cicloHabilitado = () => habilitado() && env.CICLO_INGRESOS_ORDINARIOS_HABILITADO;
export const lectura = <T>(actor: ActorDocumental, fn: (c?: PoolClient) => Promise<T>) => habilitado() ? consultar(actor, fn) : fn();
/** Identificación interna de trámite, independiente del código del original; no trunca bigint. */
export const referenciaSQL = (alias: string) => `'MP-'||lpad(${alias}.id::text,greatest(6,length(${alias}.id::text)),'0')`;
const campos = `i.id::text,${referenciaSQL('i')} referencia,i.documento_id::text,i.registrado_por_id::text,
 concat_ws(' ',u.nombre,u.apellido) registradora,to_jsonb(i.fecha_ingreso)#>>'{}' fecha_ingreso,
 to_jsonb(i.fecha_presentacion)#>>'{}' fecha_presentacion,i.presentante,i.procedencia,i.proposito,i.movimiento_recepcion_id::text${cicloHabilitado() ? `,i.ingreso_anterior_id::text,to_jsonb(i.fecha_conclusion)#>>'{}' fecha_conclusion,
 i.concluido_por_id::text,i.motivo_conclusion,i.resultado,to_jsonb(i.fecha_invalidacion)#>>'{}' fecha_invalidacion,
 i.invalidado_por_id::text,i.motivo_invalidacion,i.evidencia_resultado_id::text,
 (SELECT concat_ws(' ',nombre,apellido) FROM usuarios WHERE id=i.concluido_por_id) concluido_por,
 (SELECT concat_ws(' ',nombre,apellido) FROM usuarios WHERE id=i.invalidado_por_id) invalidado_por` : ''}`;

/** Propósito y presentación conservan exactamente el alcance de contenido documental. */
export async function obtener(actor: ActorDocumental, documento: string, c: PoolClient) {
    return (await c.query(`SELECT ${campos} FROM ingresos_mesa_partes i
        JOIN documentos d ON d.id=i.documento_id JOIN tipos_documentales td ON td.id=d.tipo_documental_id
        JOIN usuarios u ON u.id=i.registrado_por_id WHERE ${contenidoAutorizadoSQL()} AND d.id=$3
        AND i.fecha_conclusion IS NULL AND i.fecha_invalidacion IS NULL`, [actor.id, actor.rol === 'Director(a)', documento])).rows[0] ?? null;
}

/** Permite solo una primera presentación; no habilita reingresos ni estados terminales. */
export async function existe(documento: string, c: PoolClient) {
    return (await c.query('SELECT 1 FROM ingresos_mesa_partes WHERE documento_id=$1', [documento])).rowCount !== 0;
}
/** Clave de envío, no identidad del original ni deduplicación por contenido. */
export async function existeSolicitud(actor: ActorDocumental, solicitud: string, c: PoolClient) {
    return (await c.query('SELECT 1 FROM ingresos_mesa_partes WHERE solicitud_id=$1 AND registrado_por_id=$2', [solicitud, actor.id])).rowCount !== 0;
}

/** Vista mínima del original efectivamente dirigido al actor; no es una búsqueda global. */
export async function recepcion(actor: ActorDocumental, movimiento: string, c: PoolClient) {
    return (await c.query(`SELECT m.id::text movimiento_id,m.estado,m.documento_id::text,d.codigo,d.asunto,d.remitente,
        td.nombre tipo_documental,concat_ws(' ',u.nombre,u.apellido) registrador,d.registrado_por_id::text,
        d.responsable_actual_id::text,d.estado_tramite,d.archivador_id::text,d.activo,
        CASE WHEN d.archivador_id IS NOT NULL THEN concat(e.codigo,' / Archivador ',ar.numero) ELSE NULL END ubicacion,
        da.archivo_id::text,a.nombre archivo_nombre,concat_ws(' ',ua.nombre,ua.apellido) archivo_responsable,
        concat_ws(' ',uc.nombre,uc.apellido) custodio,o.nombre oficina_custodia,
        to_jsonb(m.fecha_recepcion)#>>'{}' fecha_recepcion
        FROM movimientos_documentales m JOIN documentos d ON d.id=m.documento_id
        JOIN tipos_documentales td ON td.id=d.tipo_documental_id JOIN usuarios u ON u.id=d.registrado_por_id
        JOIN usuarios uc ON uc.id=d.responsable_actual_id JOIN oficinas o ON o.id=d.oficina_responsable_id
        LEFT JOIN archivadores ar ON ar.id=d.archivador_id LEFT JOIN estantes e ON e.id=ar.estante_id
        LEFT JOIN documentos_archivos da ON da.documento_id=d.id LEFT JOIN archivos_institucionales a ON a.id=da.archivo_id
        LEFT JOIN archivos_asignaciones s ON s.archivo_id=a.id AND s.fecha_fin IS NULL
        LEFT JOIN usuarios ua ON ua.id=s.responsable_id
        WHERE m.id=$1 AND m.usuario_destino_id=$2 AND m.oficina_destino_id=$3 AND d.activo
        AND public.fn_mp_mesa_autorizada() AND d.destinatario_autorizado_id IS NULL
        AND NOT td.requiere_clave AND lower(btrim(td.nombre))<>'síseve'
        AND NOT EXISTS(SELECT 1 FROM movimientos_ingresos mi WHERE mi.movimiento_id=m.id)
        AND m.id=(SELECT id FROM movimientos_documentales WHERE documento_id=d.id ORDER BY id DESC LIMIT 1)
        AND (m.estado='EN_TRASLADO' OR (m.estado='RECIBIDO' AND m.recibido_por_id=$2
             AND d.responsable_actual_id=$2 AND d.oficina_responsable_id=$3))`, [movimiento, actor.id, actor.oficina_id])).rows[0];
}

export async function crear(actor: ActorDocumental, documento: string, movimiento: string | null, datos: Presentacion, c: PoolClient, solicitud?: string) {
    try {
    await c.query(`WITH instante AS (SELECT clock_timestamp() t)
        INSERT INTO ingresos_mesa_partes(documento_id,registrado_por_id,fecha_ingreso,fecha_presentacion,
          presentante,procedencia,proposito,movimiento_recepcion_id,solicitud_id)
        SELECT $1,$2,t,coalesce($3::timestamptz,(SELECT fecha_recepcion FROM movimientos_documentales WHERE id=$7),t),$4,$5,$6,$7,$8
        FROM instante`, [documento, actor.id, datos.fecha_presentacion ?? null, datos.presentante, datos.procedencia, datos.proposito, movimiento, solicitud ?? null]);
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === '23505')
            throw new HttpError(409, 'El documento ya tiene un primer ingreso o esta solicitud ya fue registrada');
        throw error;
    }
}


/** Pagina ingresos y actuaciones por separado: nunca carga todo el historial en React. */
export async function historia(documento: string, pagina: number, limite: number, c: PoolClient) {
    const total = (await c.query('SELECT count(*)::int total FROM ingresos_mesa_partes WHERE documento_id=$1', [documento])).rows[0].total;
    const ingresos = (await c.query(`SELECT ${campos} FROM ingresos_mesa_partes i JOIN usuarios u ON u.id=i.registrado_por_id
        WHERE i.documento_id=$1 ORDER BY i.id DESC LIMIT $2 OFFSET $3`, [documento, limite, (pagina-1)*limite])).rows;
    return { ingresos, total, pagina, limite };
}
export async function actuaciones(ingreso: string, pagina: number, limite: number, c: PoolClient) {
    const total = (await c.query('SELECT count(*)::int total FROM ingresos_actuaciones WHERE ingreso_id=$1', [ingreso])).rows[0].total;
    const actuaciones = (await c.query(`SELECT a.id::text,a.ingreso_id::text,a.registrado_por_id::text,a.tipo,a.descripcion,
      to_jsonb(a.fecha_actuacion)#>>'{}' fecha_actuacion,concat_ws(' ',u.nombre,u.apellido) responsable,
      a.custodio_id::text,a.oficina_id::text,a.version_documental,
      coalesce(a.tipo='EVIDENCIA_RESULTADO' AND a.version_documental=d.xmin::text AND a.custodio_id=d.responsable_actual_id
       AND a.oficina_id=d.oficina_responsable_id AND public.fn_mp_original_libre(d.id),false) vigente
      FROM ingresos_actuaciones a JOIN usuarios u ON u.id=a.registrado_por_id
      JOIN ingresos_mesa_partes i ON i.id=a.ingreso_id JOIN documentos d ON d.id=i.documento_id
      WHERE a.ingreso_id=$1 ORDER BY a.id DESC LIMIT $2 OFFSET $3`, [ingreso,limite,(pagina-1)*limite])).rows;
    return { actuaciones,total,pagina,limite };
}
/** Lectura bajo el bloqueo previo del documento; no exige UPDATE al custodio. */
export async function bloquearIngreso(documento: string, ingreso: string, c: PoolClient) {
    return (await c.query(`SELECT id::text,registrado_por_id::text,fecha_conclusion,fecha_invalidacion FROM ingresos_mesa_partes
        WHERE documento_id=$1 AND id=$2`, [documento,ingreso])).rows[0];
}
export async function agregarActuacion(actor: ActorDocumental, documento: string, ingreso: string, descripcion: string, evidencia: boolean, c: PoolClient) {
    return (await c.query(`INSERT INTO ingresos_actuaciones(ingreso_id,registrado_por_id,fecha_actuacion,descripcion,tipo,version_documental,custodio_id,oficina_id)
      SELECT $1,$2,clock_timestamp(),$3,$4,CASE WHEN $5 THEN d.xmin::text END,CASE WHEN $5 THEN d.responsable_actual_id END,
      CASE WHEN $5 THEN d.oficina_responsable_id END FROM documentos d WHERE d.id=$6 RETURNING id::text`,
      [ingreso,actor.id,descripcion,evidencia?'EVIDENCIA_RESULTADO':'CONTINUACION',evidencia,documento])).rows[0];
}
export async function cerrar(actor: ActorDocumental, ingreso: string, motivo: string, evidencia: string | null, c: PoolClient) {
    if (evidencia) await c.query(`UPDATE ingresos_mesa_partes SET fecha_conclusion=clock_timestamp(),concluido_por_id=$2,
      motivo_conclusion=$3,evidencia_resultado_id=$4,resultado=(SELECT descripcion FROM ingresos_actuaciones WHERE id=$4) WHERE id=$1`,
      [ingreso,actor.id,motivo,evidencia]);
    else await c.query(`UPDATE ingresos_mesa_partes SET fecha_invalidacion=clock_timestamp(),invalidado_por_id=$2,motivo_invalidacion=$3 WHERE id=$1`, [ingreso,actor.id,motivo]);
}
export async function reingresar(actor: ActorDocumental, documento: string, anterior: string, datos: Presentacion & { movimiento_recepcion_id?: string }, c: PoolClient) {
    await c.query("SELECT set_config('app.mp_presentacion_confirmada','true',true)");
    const ingreso = (await c.query(`WITH instante AS (SELECT clock_timestamp() t)
      INSERT INTO ingresos_mesa_partes(documento_id,registrado_por_id,fecha_ingreso,fecha_presentacion,presentante,procedencia,proposito,ingreso_anterior_id,movimiento_recepcion_id)
      SELECT $1,$2,t,t,$3,$4,$5,$6,$7 FROM instante RETURNING id::text`,
      [documento,actor.id,datos.presentante,datos.procedencia,datos.proposito,anterior,datos.movimiento_recepcion_id??null])).rows[0];
    if (datos.movimiento_recepcion_id) {
        await c.query("SELECT set_config('app.primer_ingreso_operacion','REINGRESO_RECEPCION',true)");
        await c.query(`INSERT INTO movimientos_ingresos(movimiento_id,ingreso_id,documento_id,vinculado_por_id,fecha_vinculacion,motivo)
          VALUES($1,$2,$3,$4,clock_timestamp(),'Entrega física posterior y presentación del reingreso')`,
          [datos.movimiento_recepcion_id,ingreso.id,documento,actor.id]);
    }
    return ingreso;
}

/** Auditoría sin valores privados, filtrada por documento autorizado antes de paginar. */
export async function auditoria(documento: string, pagina: number, limite: number, c: PoolClient) {
    const base=`FROM auditoria_archivistica a WHERE
      (a.tabla='ingresos_mesa_partes' AND EXISTS(SELECT 1 FROM ingresos_mesa_partes i WHERE i.id=a.registro_id AND i.documento_id=$1))
      OR (a.tabla='ingresos_actuaciones' AND EXISTS(SELECT 1 FROM ingresos_actuaciones ac JOIN ingresos_mesa_partes i ON i.id=ac.ingreso_id WHERE ac.id=a.registro_id AND i.documento_id=$1))
      OR (a.tabla='movimientos_ingresos' AND EXISTS(SELECT 1 FROM movimientos_ingresos mi WHERE mi.id=a.registro_id AND mi.documento_id=$1))`;
    const total=(await c.query(`SELECT count(*)::int total ${base}`,[documento])).rows[0].total;
    const auditoria=(await c.query(`SELECT a.id::text,a.tabla,a.registro_id::text,a.accion,a.usuario_actor_id::text,
      (SELECT concat_ws(' ',nombre,apellido) FROM usuarios WHERE id=a.usuario_actor_id) responsable,
      to_jsonb(a.fecha)#>>'{}' fecha,a.campos_modificados ${base} ORDER BY a.id DESC LIMIT $2 OFFSET $3`,[documento,limite,(pagina-1)*limite])).rows;
    return {auditoria,total,pagina,limite};
}
