import type { PoolClient } from 'pg';
import { pool } from '../../config/database.js';
import type { EstanteDatos, ArchivadorDatos, Filtros } from './ubicaciones.schema.js';
export interface Actor {
    id: string;
    rol: string;
    oficina_id: string | null;
    activo: boolean;
}
export interface Estante extends EstanteDatos {
    id: string;
    oficina: string;
    responsable: string;
    responsable_activo: boolean;
    fecha_creacion: string;
    fecha_modificacion: string;
}
export interface Archivador {
    id: string;
    estante_id: string;
    numero: number;
    codigo: string;
    usuario_id: string;
    oficina_id: string;
    oficina: string;
    responsable: string;
    fecha_creacion: string;
    fecha_modificacion: string;
}
/**
 * Consulta rol, oficina y actividad de una cuenta; la capa de servicio exige que siga activa antes de operar.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function actor(id: string, cliente?: PoolClient) {
    return (await (cliente ?? pool).query<Actor>(`SELECT u.id::text,r.nombre rol,u.oficina_id::text,u.activo FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.id=$1::bigint`, [id])).rows[0];
}
/**
 * Determina el alcance de consulta de ubicaciones para Administración y Dirección; no concede permiso de edición.
 * @param actorActual - Cuenta vigente cuyos permisos de consulta se evalúan.
 * @returns true para Administración o Dirección; false limita la consulta a ubicaciones propias.
 */
export function consultaGlobal(actorActual: Actor) {
    return actorActual.rol === 'Administrador' || actorActual.rol === 'Director(a)';
}
const estanteColumnas = `e.id::text,e.codigo,e.usuario_id::text,e.oficina_id::text,o.nombre oficina,concat_ws(' ',u.nombre,u.apellido) responsable,u.activo responsable_activo,to_jsonb(e.fecha_creacion)#>>'{}' fecha_creacion,to_jsonb(e.fecha_modificacion)#>>'{}' fecha_modificacion`;
const estanteJoins = `FROM estantes e JOIN oficinas o ON o.id=e.oficina_id JOIN usuarios u ON u.id=e.usuario_id`;
/** La autorización se aplica en SQL antes de devolver filas, incluso en detalles y filtros. */
export async function estantes(actorActual: Actor, filtros: Filtros = {}, id: string | null = null, cliente?: PoolClient) {
    return (await (cliente ?? pool).query<Estante>(`SELECT ${estanteColumnas} ${estanteJoins}
 WHERE ($1::boolean OR e.usuario_id=$2::bigint) AND ($3::bigint IS NULL OR e.id=$3::bigint)
 AND ($4::bigint IS NULL OR e.oficina_id=$4::bigint) AND ($5::bigint IS NULL OR e.usuario_id=$5::bigint) ORDER BY o.nombre,e.codigo,e.id`, [consultaGlobal(actorActual), actorActual.id, id, filtros.oficina_id ?? null, filtros.usuario_id ?? null])).rows;
}
/**
 * Lista archivadores aplicando en SQL el alcance del actor y filtros de oficina, responsable, padre o ID.
 * @param filtros - Filtros validados de búsqueda y paginación.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function archivadores(actorActual: Actor, filtros: Filtros = {}, id: string | null = null, cliente?: PoolClient) {
    return (await (cliente ?? pool).query<Archivador>(`SELECT ar.id::text,ar.estante_id::text,ar.numero,e.codigo,e.usuario_id::text,e.oficina_id::text,o.nombre oficina,concat_ws(' ',u.nombre,u.apellido) responsable,
 to_jsonb(ar.fecha_creacion)#>>'{}' fecha_creacion,to_jsonb(ar.fecha_modificacion)#>>'{}' fecha_modificacion
 FROM archivadores ar JOIN estantes e ON e.id=ar.estante_id JOIN oficinas o ON o.id=e.oficina_id JOIN usuarios u ON u.id=e.usuario_id
 WHERE ($1::boolean OR e.usuario_id=$2::bigint) AND ($3::bigint IS NULL OR ar.id=$3::bigint)
 AND ($4::bigint IS NULL OR e.oficina_id=$4::bigint) AND ($5::bigint IS NULL OR e.usuario_id=$5::bigint)
 AND ($6::bigint IS NULL OR e.id=$6::bigint) ORDER BY o.nombre,e.codigo,ar.numero,ar.id`, [consultaGlobal(actorActual), actorActual.id, id, filtros.oficina_id ?? null, filtros.usuario_id ?? null, filtros.estante_id ?? null])).rows;
}
/**
 * Consulta ID y nombre de oficinas para opciones de asignación; el servicio restringe las opciones según el actor.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function oficinas(cliente?: PoolClient) {
    return (await (cliente ?? pool).query<{
        id: string;
        nombre: string;
    }>('SELECT id::text,nombre FROM oficinas ORDER BY nombre')).rows;
}
/**
 * Consulta metadatos de cuentas para asignar responsables; el servicio solo expone este catálogo al administrador.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function responsables(cliente?: PoolClient) {
    return (await (cliente ?? pool).query<{
        id: string;
        nombre: string;
        oficina_id: string | null;
        activo: boolean;
    }>(`SELECT id::text,concat_ws(' ',nombre,apellido) nombre,oficina_id::text,activo FROM usuarios ORDER BY apellido,nombre`)).rows;
}
/**
 * Bloquea el estante antes de comprobar duplicados, responsabilidad o archivadores asociados.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function bloquearEstante(id: string, cliente: PoolClient) {
    await cliente.query('SELECT id FROM estantes WHERE id=$1::bigint FOR UPDATE', [id]);
}
/**
 * Comprueba código repetido para el mismo responsable, excluyendo el estante editado.
 * @param datos - Datos de entrada según el contrato tipado de esta operación.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function duplicadoEstante(datos: EstanteDatos, id: string | null, cliente: PoolClient) {
    return (await cliente.query('SELECT id FROM estantes WHERE usuario_id=$1::bigint AND codigo=$2 AND ($3::bigint IS NULL OR id<>$3::bigint)', [datos.usuario_id, datos.codigo, id])).rowCount !== 0;
}
/**
 * Inserta un estante con oficina fija o actualiza código y responsable conservando sus referencias; devuelve su ID.
 * @param datos - Datos de entrada según el contrato tipado de esta operación.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function guardarEstante(datos: EstanteDatos, id: string | null, cliente: PoolClient) {
    if (id) {
        await cliente.query('UPDATE estantes SET codigo=$2,usuario_id=$3::bigint WHERE id=$1::bigint', [id, datos.codigo, datos.usuario_id]);
        return id;
    }
    return (await cliente.query<{
        id: string;
    }>('INSERT INTO estantes(codigo,usuario_id,oficina_id) VALUES($1,$2::bigint,$3::bigint) RETURNING id::text', [datos.codigo, datos.usuario_id, datos.oficina_id])).rows[0]!.id;
}
/**
 * Comprueba si el número ya existe dentro del estante, excluyendo el archivador editado.
 * @param datos - Datos de entrada según el contrato tipado de esta operación.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function duplicadoArchivador(datos: ArchivadorDatos, id: string | null, cliente: PoolClient) {
    return (await cliente.query('SELECT id FROM archivadores WHERE estante_id=$1::bigint AND numero=$2 AND ($3::bigint IS NULL OR id<>$3::bigint)', [datos.estante_id, datos.numero, id])).rowCount !== 0;
}
/**
 * Inserta el archivador en su estante o cambia solo el número de uno existente; devuelve el ID preservado.
 * @param datos - Datos de entrada según el contrato tipado de esta operación.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function guardarArchivador(datos: ArchivadorDatos, id: string | null, cliente: PoolClient) {
    if (id) {
        await cliente.query('UPDATE archivadores SET numero=$2 WHERE id=$1::bigint', [id, datos.numero]);
        return id;
    }
    return (await cliente.query<{
        id: string;
    }>('INSERT INTO archivadores(estante_id,numero) VALUES($1::bigint,$2) RETURNING id::text', [datos.estante_id, datos.numero])).rows[0]!.id;
}
