import type { PoolClient } from 'pg';
import { pool } from '../../config/database.js';
/** Proyección administrativa: describe configuración sin incluir hashes ni contenido. */
interface Configuracion {
    id: string;
    prefijo_codigo: string | null;
    clave_configurada: boolean;
}
/** Permiso individual y metadatos de cuenta necesarios para la administración de acceso. */
interface Autorizacion {
    usuario_id: string;
    nombre: string;
    cuenta_activa: boolean;
    autorizado: boolean;
    fecha_autorizacion: string | null;
    fecha_revocacion: string | null;
}
/** Nunca devuelve hashes desde las proyecciones publicas de administracion. */
export async function tipo(cliente?: PoolClient) {
    return (await (cliente ?? pool).query<{
        id: string;
    }>(`SELECT id::text FROM tipos_documentales WHERE nombre='SíseVe' AND requiere_clave FOR SHARE`)).rows[0];
}
/**
 * Obtiene ID, prefijo e indicador de clave configurada; no devuelve el hash ni contenido restringido.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function configuracion() {
    return (await pool.query<Configuracion>(`SELECT t.id::text,t.prefijo_codigo,EXISTS(SELECT 1 FROM claves_tipos_documentales c WHERE c.tipo_documental_id=t.id) clave_configurada FROM tipos_documentales t WHERE t.nombre='SíseVe' AND t.requiere_clave`)).rows[0];
}
/**
 * Lista cuentas y metadatos de autorización individual para administración; no consulta documentos ni claves.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function autorizaciones() {
    return (await pool.query<Autorizacion>(`SELECT u.id::text usuario_id,concat_ws(' ',u.nombre,u.apellido) nombre,u.activo cuenta_activa,coalesce(a.activo,false) autorizado,to_jsonb(a.fecha_autorizacion)#>>'{}' fecha_autorizacion,to_jsonb(a.fecha_revocacion)#>>'{}' fecha_revocacion FROM usuarios u LEFT JOIN autorizaciones_tipos_restringidos a ON a.usuario_id=u.id AND a.tipo_documental_id=(SELECT id FROM tipos_documentales WHERE nombre='SíseVe' AND requiere_clave) ORDER BY u.apellido,u.nombre,u.id`)).rows;
}
/**
 * Activa o revoca la autorización conservando su fila histórica y sus actores; solo permite activar cuentas vigentes.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @param tipoId - ID del tipo documental restringido validado para esta operación.
 * @param actorId - ID de la cuenta autenticada que debe revalidarse antes de operar.
 * @param usuarioId - ID de la cuenta sobre la que se consulta o administra el permiso.
 * @param activo - Condición de actividad solicitada.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function autorizar(cliente: PoolClient, tipoId: string, actorId: string, usuarioId: string, activo: boolean) {
    const usuario = (await cliente.query<{
        id: string;
    }>('SELECT id FROM usuarios WHERE id=$1 AND activo FOR SHARE', [usuarioId])).rows[0];
    if (!usuario && activo)
        return false;
    if (!activo) {
        await cliente.query(`UPDATE autorizaciones_tipos_restringidos SET activo=false,revocado_por_usuario_id=$3,fecha_revocacion=clock_timestamp() WHERE tipo_documental_id=$1 AND usuario_id=$2 AND activo`, [tipoId, usuarioId, actorId]);
        return true;
    }
    await cliente.query(`INSERT INTO autorizaciones_tipos_restringidos(tipo_documental_id,usuario_id,activo,autorizado_por_usuario_id,revocado_por_usuario_id,fecha_revocacion) VALUES($1,$2,$3,$4,CASE WHEN $3 THEN NULL ELSE $4::bigint END,CASE WHEN $3 THEN NULL ELSE clock_timestamp() END) ON CONFLICT(usuario_id,tipo_documental_id) DO UPDATE SET activo=excluded.activo,autorizado_por_usuario_id=CASE WHEN excluded.activo THEN excluded.autorizado_por_usuario_id ELSE autorizaciones_tipos_restringidos.autorizado_por_usuario_id END,fecha_autorizacion=CASE WHEN excluded.activo THEN clock_timestamp() ELSE autorizaciones_tipos_restringidos.fecha_autorizacion END,revocado_por_usuario_id=excluded.revocado_por_usuario_id,fecha_revocacion=excluded.fecha_revocacion WHERE NOT autorizaciones_tipos_restringidos.activo`, [tipoId, usuarioId, activo, actorId]);
    return true;
}
/**
 * Inserta o sustituye el hash del tipo restringido en la transacción administrativa; nunca recibe una clave en texto claro.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @param tipoId - ID del tipo documental restringido validado para esta operación.
 * @param hash - Hash derivado previamente; no contiene la contraseña en texto claro.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function guardarClave(cliente: PoolClient, tipoId: string, hash: string) {
    await cliente.query(`INSERT INTO claves_tipos_documentales(tipo_documental_id,clave_hash) VALUES($1,$2) ON CONFLICT(tipo_documental_id) DO UPDATE SET clave_hash=excluded.clave_hash`, [tipoId, hash]);
}
/** Bloqueos compartidos conservan autorizacion y clave hasta concluir la operacion atomica. */
export async function acceso(cliente: PoolClient, tipoId: string, usuarioId: string) {
    const autorizacion = (await cliente.query<{
        activo: boolean;
    }>('SELECT activo FROM autorizaciones_tipos_restringidos WHERE tipo_documental_id=$1 AND usuario_id=$2 FOR SHARE', [tipoId, usuarioId])).rows[0];
    const clave = (await cliente.query<{
        clave_hash: string;
    }>('SELECT clave_hash FROM claves_tipos_documentales WHERE tipo_documental_id=$1 FOR SHARE', [tipoId])).rows[0];
    return { autorizado: autorizacion?.activo === true, hash: clave?.clave_hash };
}
/** Metadatos de la cuenta propia; no enumera documentos, ubicaciones ni autorizaciones ajenas. */
export async function accesoPropio(usuarioId: string) {
    return (await pool.query<{
        tipo_documental_id: string;
        autorizado: boolean;
        clave_configurada: boolean;
    }>(`SELECT EXISTS(SELECT 1 FROM claves_tipos_documentales c WHERE c.tipo_documental_id=t.id) clave_configurada,t.id::text tipo_documental_id,EXISTS(SELECT 1 FROM autorizaciones_tipos_restringidos a WHERE a.tipo_documental_id=t.id AND a.usuario_id=$1 AND a.activo) autorizado FROM tipos_documentales t WHERE t.nombre='SíseVe' AND t.requiere_clave`, [usuarioId])).rows[0];
}
/** Exclusivo del servicio administrativo: el hash nunca forma parte de un DTO de respuesta. */
export async function claveActual(cliente: PoolClient, tipoId: string) {
    return (await cliente.query<{
        clave_hash: string;
    }>('SELECT clave_hash FROM claves_tipos_documentales WHERE tipo_documental_id=$1 FOR UPDATE', [tipoId])).rows[0]?.clave_hash;
}
