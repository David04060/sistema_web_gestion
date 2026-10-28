import type { PoolClient } from 'pg';
import { conexionDocumental } from '../../shared/documental/contexto.js';
import type { ActorDocumental } from '../../shared/documental/transaccion.js';
import { recorridoAutorizadoSQL } from '../documentos/documentos.repository.js';
import type { Filtros } from './movimientos.schema.js';
import type { EstadoMovimiento } from '../../shared/documental/estados.js';
export interface Movimiento {
    registrado_por: string | null;
    decidido_por: string | null;
    trasladado_por: string | null;
    recibido_por: string | null;
    rechazado_por: string | null;
    devolucion_confirmada_por: string | null;
    cancelado_por: string | null;
    id: string;
    documento_id: string;
    codigo: string;
    oficina_origen_id: string;
    oficina_origen: string;
    usuario_origen_id: string;
    usuario_origen: string;
    oficina_destino_id: string;
    oficina_destino: string;
    usuario_destino_id: string;
    usuario_destino: string;
    registrado_por_id: string;
    decidido_por_id: string | null;
    trasladado_por_id: string | null;
    estado: EstadoMovimiento;
    fecha_salida: string | null;
    recibido_por_id: string | null;
    fecha_recepcion: string | null;
    rechazado_por_id: string | null;
    fecha_rechazo: string | null;
    motivo_rechazo: string | null;
    devolucion_confirmada_por_id: string | null;
    fecha_confirmacion_devolucion: string | null;
    cancelado_por_id: string | null;
    fecha_cancelacion: string | null;
    motivo_cancelacion: string | null;
    fecha_creacion: string;
    fecha_modificacion: string;
}
/** Los participantes históricos ven el recorrido, sin serializar asunto, observaciones o archivador. */
const columnas = `nullif(concat_ws(' ',n0.nombre,n0.apellido),'') registrado_por,nullif(concat_ws(' ',n1.nombre,n1.apellido),'') decidido_por,nullif(concat_ws(' ',n2.nombre,n2.apellido),'') trasladado_por,nullif(concat_ws(' ',n3.nombre,n3.apellido),'') recibido_por,nullif(concat_ws(' ',n4.nombre,n4.apellido),'') rechazado_por,nullif(concat_ws(' ',n5.nombre,n5.apellido),'') devolucion_confirmada_por,nullif(concat_ws(' ',n6.nombre,n6.apellido),'') cancelado_por,m.id::text,m.documento_id::text,d.codigo,m.oficina_origen_id::text,oo.nombre oficina_origen,m.usuario_origen_id::text,concat_ws(' ',uo.nombre,uo.apellido) usuario_origen,
 m.oficina_destino_id::text,od.nombre oficina_destino,m.usuario_destino_id::text,concat_ws(' ',ud.nombre,ud.apellido) usuario_destino,m.registrado_por_id::text,m.decidido_por_id::text,m.trasladado_por_id::text,
 m.estado,to_jsonb(m.fecha_salida)#>>'{}' fecha_salida,m.recibido_por_id::text,to_jsonb(m.fecha_recepcion)#>>'{}' fecha_recepcion,m.rechazado_por_id::text,to_jsonb(m.fecha_rechazo)#>>'{}' fecha_rechazo,m.motivo_rechazo,
 m.devolucion_confirmada_por_id::text,to_jsonb(m.fecha_confirmacion_devolucion)#>>'{}' fecha_confirmacion_devolucion,m.cancelado_por_id::text,to_jsonb(m.fecha_cancelacion)#>>'{}' fecha_cancelacion,m.motivo_cancelacion,to_jsonb(m.fecha_creacion)#>>'{}' fecha_creacion,to_jsonb(m.fecha_modificacion)#>>'{}' fecha_modificacion`;
const relaciones = `FROM movimientos_documentales m JOIN documentos d ON d.id=m.documento_id JOIN tipos_documentales td ON td.id=d.tipo_documental_id JOIN oficinas oo ON oo.id=m.oficina_origen_id JOIN oficinas od ON od.id=m.oficina_destino_id JOIN usuarios uo ON uo.id=m.usuario_origen_id JOIN usuarios ud ON ud.id=m.usuario_destino_id LEFT JOIN usuarios n0 ON n0.id=m.registrado_por_id LEFT JOIN usuarios n1 ON n1.id=m.decidido_por_id LEFT JOIN usuarios n2 ON n2.id=m.trasladado_por_id LEFT JOIN usuarios n3 ON n3.id=m.recibido_por_id LEFT JOIN usuarios n4 ON n4.id=m.rechazado_por_id LEFT JOIN usuarios n5 ON n5.id=m.devolucion_confirmada_por_id LEFT JOIN usuarios n6 ON n6.id=m.cancelado_por_id`;
/**
 * Devuelve página y conteo desde una única CTE con autorización de recorrido, filtros y bandeja; excluye contenido del documento.
 * @param actor - Cuenta o ID autenticado utilizado para aplicar autorización y auditoría.
 * @param f - Filtros validados de consulta.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function listar(actor: ActorDocumental, f: Filtros) {
    return (await conexionDocumental().query<{
        total: number;
        movimientos: Movimiento[];
    }>(`WITH visibles AS (SELECT ${columnas} ${relaciones} WHERE ${recorridoAutorizadoSQL()} AND ($3::bigint IS NULL OR m.documento_id=$3::bigint) AND ($4::text IS NULL OR m.estado=$4)
 AND ($7::text IS NULL OR ($7='entrada' AND m.usuario_destino_id=$1 AND m.estado='EN_TRASLADO') OR ($7='salida' AND m.usuario_origen_id=$1 AND m.estado='EN_TRASLADO') OR ($7='recuperacion' AND m.usuario_origen_id=$1 AND m.estado='RECHAZADO' AND m.devolucion_confirmada_por_id IS NULL)))
 SELECT (SELECT count(*)::int FROM visibles) total,COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM (SELECT * FROM visibles ORDER BY fecha_creacion DESC,id::bigint DESC LIMIT $5 OFFSET $6)p),'[]'::jsonb) movimientos`, [actor.id, actor.rol === 'Director(a)', f.documento_id ?? null, f.estado ?? null, f.limite, (f.pagina - 1) * f.limite, f.bandeja ?? null])).rows[0];
}
/**
 * Consulta un movimiento con autorización de recorrido; devuelve undefined tanto si no existe como si no resulta visible.
 * @param actor - Cuenta o ID autenticado utilizado para aplicar autorización y auditoría.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function obtener(actor: ActorDocumental, id: string, cliente?: PoolClient) {
    return (await (cliente ?? conexionDocumental()).query<Movimiento>(`SELECT ${columnas} ${relaciones} WHERE ${recorridoAutorizadoSQL()} AND m.id=$3::bigint`, [actor.id, actor.rol === 'Director(a)', id])).rows[0];
}
/** Bloqueo posterior al documento: todas las operaciones mantienen el mismo orden de filas. */
export async function bloquear(id: string, c: PoolClient) {
    await c.query('SELECT id FROM movimientos_documentales WHERE id=$1 FOR UPDATE', [id]);
}
/**
 * Registra la salida física con origen, destino y autor de decisión históricos; devuelve el ID para confirmar también el documento en la misma transacción.
 * @param d - Datos tipados del registro o formulario de esta operación.
 * @param c - Conexión PostgreSQL de la instantánea o transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function crear(d: {
    id: string;
    responsable_actual_id: string;
    oficina_responsable_id: string;
    decision_autorizada_por_id: string | null;
}, destino: {
    id: string;
    oficina_id: string;
}, c: PoolClient) {
    return (await c.query<{
        id: string;
    }>(`INSERT INTO movimientos_documentales(documento_id,oficina_origen_id,usuario_origen_id,oficina_destino_id,usuario_destino_id,registrado_por_id,decidido_por_id,trasladado_por_id,estado,fecha_salida)
 VALUES($1,$2,$3,$4,$5,$3,$6,$3,'EN_TRASLADO',clock_timestamp()) RETURNING id::text`, [d.id, d.oficina_responsable_id, d.responsable_actual_id, destino.oficina_id, destino.id, d.decision_autorizada_por_id])).rows[0]!.id;
}
/**
 * Registra receptor y fecha efectiva, pasando el movimiento a RECIBIDO dentro de la transacción documental.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param actor - Cuenta o ID autenticado utilizado para aplicar autorización y auditoría.
 * @param c - Conexión PostgreSQL de la instantánea o transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function recibir(id: string, actor: string, c: PoolClient) {
    await c.query(`UPDATE movimientos_documentales SET estado='RECIBIDO',recibido_por_id=$2,fecha_recepcion=clock_timestamp() WHERE id=$1`, [id, actor]);
}
/**
 * Registra actor, fecha y motivo del rechazo sin confirmar recuperación ni cambiar la custodia de origen.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param actor - Cuenta o ID autenticado utilizado para aplicar autorización y auditoría.
 * @param motivo - Justificación que acompaña la operación y su auditoría.
 * @param c - Conexión PostgreSQL de la instantánea o transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function rechazar(id: string, actor: string, motivo: string, c: PoolClient) {
    await c.query(`UPDATE movimientos_documentales SET estado='RECHAZADO',rechazado_por_id=$2,fecha_rechazo=clock_timestamp(),motivo_rechazo=$3 WHERE id=$1`, [id, actor, motivo]);
}
/**
 * Confirma actor y fecha de devolución manteniendo el estado RECHAZADO como antecedente histórico.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param actor - Cuenta o ID autenticado utilizado para aplicar autorización y auditoría.
 * @param c - Conexión PostgreSQL de la instantánea o transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function recuperar(id: string, actor: string, c: PoolClient) {
    await c.query(`UPDATE movimientos_documentales SET devolucion_confirmada_por_id=$2,fecha_confirmacion_devolucion=clock_timestamp() WHERE id=$1`, [id, actor]);
}
/** Cancelacion confirma simultaneamente que el original ya se recupero fisicamente. */
export async function cancelar(id: string, actor: string, motivo: string, c: PoolClient) {
    await c.query(`WITH instante AS (SELECT clock_timestamp() t) UPDATE movimientos_documentales SET estado='CANCELADO',cancelado_por_id=$2,fecha_cancelacion=t,motivo_cancelacion=$3,devolucion_confirmada_por_id=$2,fecha_confirmacion_devolucion=t FROM instante WHERE id=$1`, [id, actor, motivo]);
}
