import type { PoolClient } from 'pg';
import { conexionDocumental, tipoVisibleSQL } from '../../shared/documental/contexto.js';
import type { ActorDocumental } from '../../shared/documental/transaccion.js';
import type { Contenido, Filtros, Registrar } from './documentos.schema.js';
import type { EstadoDocumento } from '../../shared/documental/estados.js';
export interface Documento extends Contenido {
    id: string;
    codigo: string;
    destinatario_autorizado_id: string | null;
    oficina_destino_autorizada_id: string | null;
    decision_autorizada_por_id: string | null;
    tipo_documental_id: string;
    tipo_documental: string;
    archivador_id: string | null;
    registrado_por_id: string;
    registrador: string;
    responsable_actual_id: string;
    responsable: string;
    oficina_responsable_id: string;
    oficina: string;
    estado_tramite: EstadoDocumento;
    activo: boolean;
    estante_id: string | null;
    estante: string | null;
    archivador_numero: number | null;
    fecha_creacion: string;
    fecha_modificacion: string;
}
/** Exclusión obligatoria incluso para Administrador y Director, antes de filas, totales e historial. */
export const contenidoAutorizadoSQL = () => `(${tipoVisibleSQL()} AND (d.registrado_por_id=$1::bigint OR d.responsable_actual_id=$1::bigint OR $2::boolean))`;
/**
 * Construye el predicado de recorrido: admite participantes históricos además de creador, custodio y Dirección, pero mantiene la exclusión del tipo restringido.
 * @returns Fragmento SQL con los parámetros $1 (actor) y $2 (alcance de Dirección); el llamador vincula sus valores.
 */
export const recorridoAutorizadoSQL = () => `(${tipoVisibleSQL()} AND (d.registrado_por_id=$1::bigint OR d.responsable_actual_id=$1::bigint OR $2::boolean OR EXISTS (
 SELECT 1 FROM movimientos_documentales acceso WHERE acceso.documento_id=d.id AND $1::bigint IN (acceso.usuario_origen_id,acceso.usuario_destino_id,acceso.registrado_por_id,acceso.decidido_por_id,acceso.trasladado_por_id))))`;
const columnas = `d.id::text,d.codigo,d.destinatario_autorizado_id::text,d.oficina_destino_autorizada_id::text,d.decision_autorizada_por_id::text,d.tipo_documental_id::text,td.nombre tipo_documental,d.asunto,d.remitente,d.observaciones,d.archivador_id::text,d.registrado_por_id::text,concat_ws(' ',ur.nombre,ur.apellido) registrador,d.responsable_actual_id::text,concat_ws(' ',uc.nombre,uc.apellido) responsable,d.oficina_responsable_id::text,o.nombre oficina,d.estado_tramite,d.activo,e.id::text estante_id,e.codigo estante,ar.numero archivador_numero,to_jsonb(d.fecha_creacion)#>>'{}' fecha_creacion,to_jsonb(d.fecha_modificacion)#>>'{}' fecha_modificacion`;
const relaciones = `FROM documentos d JOIN tipos_documentales td ON td.id=d.tipo_documental_id JOIN usuarios ur ON ur.id=d.registrado_por_id JOIN usuarios uc ON uc.id=d.responsable_actual_id JOIN oficinas o ON o.id=d.oficina_responsable_id LEFT JOIN archivadores ar ON ar.id=d.archivador_id LEFT JOIN estantes e ON e.id=ar.estante_id`;
/** Página y conteo comparten predicado de autorización y la misma instantánea SQL. */
export async function listar(actor: ActorDocumental, f: Filtros) {
    const patron = `%${f.q.replace(/[\\%_]/g, '\\$&')}%`;
    return (await conexionDocumental().query<{
        documentos: Documento[];
        total: number;
    }>(`WITH visibles AS (SELECT ${columnas} ${relaciones} WHERE ${contenidoAutorizadoSQL()}
 AND concat_ws(' ',d.codigo,d.asunto,d.remitente) ILIKE $3 ESCAPE E'\\\\'
 AND ($4::bigint IS NULL OR d.tipo_documental_id=$4::bigint) AND ($5::bigint IS NULL OR d.oficina_responsable_id=$5::bigint)
 AND ($6::bigint IS NULL OR d.responsable_actual_id=$6::bigint) AND ($7::bigint IS NULL OR d.archivador_id=$7::bigint)
 AND ($8::text IS NULL OR d.estado_tramite=$8) AND ($9::boolean IS NULL OR d.activo=$9))
 SELECT (SELECT count(*)::int FROM visibles) total,COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM (SELECT * FROM visibles ORDER BY fecha_creacion DESC,id::bigint DESC LIMIT $10 OFFSET $11) p),'[]'::jsonb) documentos`, [actor.id, actor.rol === 'Director(a)', patron, f.tipo_documental_id ?? null, f.oficina_id ?? null, f.responsable_id ?? null, f.archivador_id ?? null, f.estado ?? null, f.activo === undefined ? null : f.activo === 'true', f.limite, (f.pagina - 1) * f.limite])).rows[0]!;
}
/**
 * Consulta el contenido de un documento aplicando el mismo predicado de autorización que el listado; devuelve undefined si no existe o no es visible.
 * @param actor - Cuenta o ID autenticado utilizado para aplicar autorización y auditoría.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function obtener(actor: ActorDocumental, id: string, cliente?: PoolClient) {
    return (await (cliente ?? conexionDocumental()).query<Documento>(`SELECT ${columnas} ${relaciones} WHERE ${contenidoAutorizadoSQL()} AND d.id=$3::bigint`, [actor.id, actor.rol === 'Director(a)', id])).rows[0];
}
/** Solo devuelve metadatos mínimos de acceso al recorrido; no expone contenido al participante histórico. */
export async function accesoRecorrido(actor: ActorDocumental, id: string, cliente?: PoolClient) {
    return (await (cliente ?? conexionDocumental()).query<{
        id: string;
        codigo: string;
    }>(`SELECT d.id::text,d.codigo FROM documentos d JOIN tipos_documentales td ON td.id=d.tipo_documental_id WHERE ${recorridoAutorizadoSQL()} AND d.id=$3::bigint`, [actor.id, actor.rol === 'Director(a)', id])).rows[0];
}
/**
 * Bloquea la fila documental con FOR UPDATE dentro de la transacción del servicio; no concede acceso por sí mismo.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function bloquear(id: string, cliente: PoolClient) {
    await cliente.query('SELECT id FROM documentos WHERE id=$1::bigint FOR UPDATE', [id]);
}
/**
 * Actualiza exclusivamente asunto, remitente y observaciones; los triggers conservan la auditoría con actor y motivo transaccionales.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param datos - Datos de entrada según el contrato tipado de esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function corregir(id: string, datos: Contenido, cliente: PoolClient) {
    await cliente.query('UPDATE documentos SET asunto=$2,remitente=$3,observaciones=$4 WHERE id=$1::bigint', [id, datos.asunto, datos.remitente, datos.observaciones]);
}
/** La anulación conserva código, relaciones e historial; cambia a CANCELADO y retira la autorización de salida. */
export async function anular(id: string, cliente: PoolClient) {
    await cliente.query(`UPDATE documentos SET activo=false,estado_tramite='CANCELADO',destinatario_autorizado_id=NULL,oficina_destino_autorizada_id=NULL,decision_autorizada_por_id=NULL WHERE id=$1::bigint`, [id]);
}
/**
 * Obtiene cronológicamente la auditoría del documento; el servicio debe haber autorizado antes el acceso a su contenido.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function historial(id: string) {
    return (await conexionDocumental().query(`SELECT h.id::text,h.accion,h.usuario_actor_id::text,concat_ws(' ',u.nombre,u.apellido) actor,to_jsonb(h.fecha)#>>'{}' fecha,h.campos_modificados FROM historial_modificaciones h LEFT JOIN usuarios u ON u.id=h.usuario_actor_id WHERE h.tabla='documentos' AND h.registro_id=$1::bigint ORDER BY h.fecha,h.id`, [id])).rows;
}
/** Inserta solamente entradas humanas; PostgreSQL asigna codigo, identidad y fechas. */
export async function registrar(actor: ActorDocumental, datos: Registrar, estado: EstadoDocumento, cliente: PoolClient) {
    return (await cliente.query<{
        id: string;
    }>(`INSERT INTO documentos(tipo_documental_id,asunto,remitente,observaciones,archivador_id,registrado_por_id,responsable_actual_id,oficina_responsable_id,estado_tramite)
 VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8) RETURNING id::text`, [datos.tipo_documental_id, datos.asunto, datos.remitente, datos.observaciones, datos.archivador_id, actor.id, actor.oficina_id, estado])).rows[0]!.id;
}
/**
 * Obtiene el nombre institucional de la oficina en la conexión bloqueada para evaluar el circuito de Dirección.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function oficinaNombre(id: string, cliente: PoolClient) {
    return (await cliente.query<{
        nombre: string;
    }>('SELECT nombre FROM oficinas WHERE id=$1', [id])).rows[0]?.nombre;
}
/**
 * Comprueba que el tipo sea visible en el contexto actual y tenga prefijo aprobado antes del registro.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function tipoRegistrable(id: string, cliente: PoolClient) {
    return (await cliente.query(`SELECT id FROM tipos_documentales td WHERE id=$1 AND ${tipoVisibleSQL()} AND prefijo_codigo IS NOT NULL`, [id])).rowCount === 1;
}
/**
 * Detecta un traslado o un rechazo todavía sin recuperación física para impedir operaciones incompatibles.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function movimientoAbierto(id: string, cliente: PoolClient) {
    return (await cliente.query(`SELECT id FROM movimientos_documentales WHERE documento_id=$1 AND (estado='EN_TRASLADO' OR (estado='RECHAZADO' AND devolucion_confirmada_por_id IS NULL))`, [id])).rowCount !== 0;
}
/** Solo devuelve datos de seleccion necesarios; nunca correo, hashes o informacion restringida. */
export async function opciones(actor: ActorDocumental) {
    // El catálogo aplica el contexto ordinario o restringido antes de enumerar tipos.
    const tipos = (await conexionDocumental().query(`SELECT id::text,nombre,prefijo_codigo FROM tipos_documentales td WHERE ${tipoVisibleSQL()} ORDER BY nombre`)).rows;
    const destinatarios = (await conexionDocumental().query(`SELECT u.id::text,concat_ws(' ',u.nombre,u.apellido) nombre,u.oficina_id::text,o.nombre oficina FROM usuarios u JOIN oficinas o ON o.id=u.oficina_id WHERE u.activo AND u.id<>$1 ORDER BY o.nombre,u.nombre`, [actor.id])).rows;
    // La ubicación seleccionable pertenece a la cuenta y a su oficina vigente, no al alcance institucional de consulta.
    const archivadores = (await conexionDocumental().query(`SELECT a.id::text,concat(e.codigo,' / Archivador ',a.numero) nombre FROM archivadores a JOIN estantes e ON e.id=a.estante_id WHERE e.usuario_id=$1 AND e.oficina_id=$2 ORDER BY e.codigo,a.numero`, [actor.id, actor.oficina_id])).rows;
    // Los filtros se derivan exclusivamente de contenido consultable: no permiten inferir documentos ajenos o restringidos.
    const filtros = (await conexionDocumental().query(`SELECT DISTINCT d.oficina_responsable_id::text oficina_id,o.nombre oficina,d.responsable_actual_id::text responsable_id,concat_ws(' ',u.nombre,u.apellido) responsable,d.archivador_id::text archivador_id,concat(e.codigo,' / Archivador ',ar.numero) ubicacion FROM documentos d JOIN tipos_documentales td ON td.id=d.tipo_documental_id JOIN oficinas o ON o.id=d.oficina_responsable_id JOIN usuarios u ON u.id=d.responsable_actual_id LEFT JOIN archivadores ar ON ar.id=d.archivador_id LEFT JOIN estantes e ON e.id=ar.estante_id WHERE ${contenidoAutorizadoSQL()}`, [actor.id, actor.rol === 'Director(a)'])).rows;
    return { tipos, destinatarios, archivadores, filtros, puede_registrar: actor.oficina_id !== null };
}
/** La triada de autorizacion se escribe o retira completa sin crear movimiento. */
export async function autorizar(id: string, destinatario: string | null, oficina: string | null, autor: string | null, cliente: PoolClient) {
    await cliente.query(`UPDATE documentos SET destinatario_autorizado_id=$2,oficina_destino_autorizada_id=$3,decision_autorizada_por_id=$4 WHERE id=$1`, [id, destinatario, oficina, autor]);
}
/**
 * Obtiene un destinatario activo con oficina y lo bloquea de forma compartida para evitar reasignaciones durante la decisión o salida.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function destino(id: string, cliente: PoolClient) {
    return (await cliente.query<{
        id: string;
        oficina_id: string;
    }>(`SELECT id::text,oficina_id::text FROM usuarios WHERE id=$1 AND activo AND oficina_id IS NOT NULL FOR SHARE`, [id])).rows[0];
}
/**
 * Vuelve a situar el documento en PENDIENTE_DECISION; el servicio verifica previamente custodia y circuito de Mesa de Partes.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function solicitarDecision(id: string, cliente: PoolClient) {
    await cliente.query(`UPDATE documentos SET estado_tramite='PENDIENTE_DECISION' WHERE id=$1`, [id]);
}
/** La salida consume la autorizacion, conservada previamente en el movimiento. */
export async function salida(id: string, cliente: PoolClient) {
    await cliente.query(`UPDATE documentos SET estado_tramite='EN_TRASLADO',archivador_id=NULL,destinatario_autorizado_id=NULL,oficina_destino_autorizada_id=NULL,decision_autorizada_por_id=NULL WHERE id=$1`, [id]);
}
/**
 * Actualiza estado, custodio, oficina y archivador al confirmar una recepción o recuperación en la misma transacción del movimiento.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param usuario - Cuenta o ID al que corresponde la operación.
 * @param oficina - ID de la oficina preservada como destino o custodia.
 * @param archivador - ID del archivador de recepción o null sin ubicación asignada.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function recibir(id: string, usuario: string, oficina: string, archivador: string | null, cliente: PoolClient) {
    await cliente.query(`UPDATE documentos SET estado_tramite='RECIBIDO',responsable_actual_id=$2,oficina_responsable_id=$3,archivador_id=$4 WHERE id=$1`, [id, usuario, oficina, archivador]);
}
/**
 * Marca el documento RECHAZADO sin transferir custodia; la recuperación posterior la confirma el origen.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function rechazar(id: string, cliente: PoolClient) {
    await cliente.query(`UPDATE documentos SET estado_tramite='RECHAZADO' WHERE id=$1`, [id]);
}
/** Antecedente auditado; no representa ubicacion confirmada durante el transporte. */
export async function ultimaUbicacion(id: string) {
    return (await conexionDocumental().query<{
        nombre: string;
        fecha: string;
    }>(`SELECT concat(o.nombre,' / ',e.codigo,' / Archivador ',a.numero) nombre,to_jsonb(h.fecha)#>>'{}' fecha FROM historial_modificaciones h JOIN archivadores a ON a.id=CASE WHEN h.campos_modificados->'archivador_id'->>'antes' ~ '^[1-9][0-9]*$' THEN (h.campos_modificados->'archivador_id'->>'antes')::bigint END JOIN estantes e ON e.id=a.estante_id JOIN oficinas o ON o.id=e.oficina_id WHERE h.tabla='documentos' AND h.registro_id=$1 ORDER BY h.fecha DESC,h.id DESC LIMIT 1`, [id])).rows[0] ?? null;
}
