import type { PoolClient } from "pg";
import { pool } from "../../config/database.js";
import type { DatosUsuario, FiltrosUsuarios } from "./usuarios.schema.js";
/** Proyección administrativa segura: jamás incluye hash ni versión de autenticación. */
export interface UsuarioAdministrado extends DatosUsuario {
    id: string;
    activo: boolean;
    rol: string;
    oficina: string | null;
    fecha_creacion: string;
    fecha_modificacion: string;
}
// JSON textual conserva timestamps ISO con zona tanto en el detalle como en la página agregada.
const COLUMNAS = `u.id::text,u.nombre,u.apellido,u.nombre_usuario,u.email,u.telefono,u.activo,
  u.rol_id::text,u.oficina_id::text,r.nombre AS rol,o.nombre AS oficina,
  to_jsonb(u.fecha_creacion)#>>'{}' AS fecha_creacion,
  to_jsonb(u.fecha_modificacion)#>>'{}' AS fecha_modificacion`;
const JOINS = `FROM usuarios u JOIN roles r ON r.id=u.rol_id LEFT JOIN oficinas o ON o.id=u.oficina_id`;
/** Escape de comodines: la búsqueda trata % y _ del usuario como caracteres literales. */
function patron(texto: string): string {
    return `%${texto.replace(/[\\%_]/g, "\\$&")}%`;
}
/**
 * Aplica búsqueda literal y filtros administrativos; devuelve página y total de una misma instantánea SQL sin hashes.
 * @param filtros - Filtros validados de búsqueda y paginación.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function listar(filtros: FiltrosUsuarios) {
    const valores = [patron(filtros.q), filtros.rol_id ?? null, filtros.oficina_id ?? null,
        filtros.activo === undefined ? null : filtros.activo === "true", filtros.limite, (filtros.pagina - 1) * filtros.limite];
    // CTE y agregación en una sola sentencia: página y total comparten la misma instantánea.
    const resultado = await pool.query<{
        usuarios: UsuarioAdministrado[];
        total: number;
    }>(`WITH filtrados AS (
      SELECT ${COLUMNAS} ${JOINS}
      WHERE (concat_ws(' ',u.nombre,u.apellido,u.nombre_usuario,u.email) ILIKE $1 ESCAPE E'\\\\')
      AND ($2::bigint IS NULL OR u.rol_id=$2::bigint)
      AND ($3::bigint IS NULL OR u.oficina_id=$3::bigint)
      AND ($4::boolean IS NULL OR u.activo=$4::boolean)
    ) SELECT (SELECT count(*)::int FROM filtrados) AS total,
      COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM
        (SELECT * FROM filtrados ORDER BY apellido,nombre,id::bigint LIMIT $5 OFFSET $6) p),'[]'::jsonb) AS usuarios`, valores);
    return { ...resultado.rows[0]!, pagina: filtros.pagina, limite: filtros.limite };
}
/**
 * Obtiene la proyección administrativa pública por ID; devuelve null si la cuenta no existe.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function obtener(id: string, cliente?: PoolClient): Promise<UsuarioAdministrado | null> {
    const resultado = await (cliente ?? pool).query<UsuarioAdministrado>(`SELECT ${COLUMNAS} ${JOINS} WHERE u.id=$1::bigint`, [id]);
    return resultado.rows[0] ?? null;
}
/** Las asignaciones se leen bajo el mismo bloqueo transaccional que protege cambios de catálogo. */
export async function asignaciones(rolId: string, oficinaId: string | null, cliente: PoolClient) {
    const rol = await cliente.query<{
        nombre: string;
    }>("SELECT nombre FROM roles WHERE id=$1::bigint FOR SHARE", [rolId]);
    const oficina = oficinaId === null ? null : (await cliente.query<{
        nombre: string;
    }>("SELECT nombre FROM oficinas WHERE id=$1::bigint FOR SHARE", [oficinaId])).rows[0] ?? null;
    return { rol: rol.rows[0] ?? null, oficina };
}
/**
 * Detecta usuario o correo repetido, excluyendo la cuenta editada; devuelve un mensaje público o null.
 * @param datos - Datos de entrada según el contrato tipado de esta operación.
 * @param excluir - ID que se omite al buscar duplicados durante una edición.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function duplicado(datos: DatosUsuario, excluir: string | null, cliente: PoolClient): Promise<string | null> {
    const resultado = await cliente.query<{
        nombre_usuario: string;
        email: string | null;
    }>(`SELECT nombre_usuario,email FROM usuarios WHERE ($3::bigint IS NULL OR id<>$3::bigint)
     AND (nombre_usuario=$1 OR ($2::text IS NOT NULL AND lower(email)=lower($2))) LIMIT 1`, [datos.nombre_usuario, datos.email, excluir]);
    const fila = resultado.rows[0];
    return fila ? (fila.nombre_usuario === datos.nombre_usuario ? "El nombre de usuario ya está registrado" : "El correo electrónico ya está registrado") : null;
}
/**
 * Cuenta administradores activos en la conexión transaccional que protege la regla del último administrador.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function administradoresActivos(cliente: PoolClient): Promise<number> {
    const resultado = await cliente.query<{
        cantidad: number;
    }>(`SELECT count(*)::int AS cantidad FROM usuarios u JOIN roles r ON r.id=u.rol_id
     WHERE u.activo AND r.nombre='Administrador'`);
    return resultado.rows[0]!.cantidad;
}
/**
 * Inserta los datos administrados y el hash previamente derivado; devuelve el ID como texto sin exponer el hash.
 * @param datos - Datos de entrada según el contrato tipado de esta operación.
 * @param hash - Hash derivado previamente; no contiene la contraseña en texto claro.
 * @param activo - Condición de actividad solicitada.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function crear(datos: DatosUsuario, hash: string, activo: boolean, cliente: PoolClient): Promise<string> {
    const resultado = await cliente.query<{
        id: string;
    }>(`INSERT INTO usuarios(nombre,apellido,nombre_usuario,email,telefono,rol_id,oficina_id,contrasena_hash,activo)
     VALUES($1,$2,$3,$4,$5,$6::bigint,$7::bigint,$8,$9) RETURNING id::text`, [datos.nombre, datos.apellido, datos.nombre_usuario, datos.email, datos.telefono, datos.rol_id, datos.oficina_id, hash, activo]);
    return resultado.rows[0]!.id;
}
/**
 * Actualiza datos personales, rol y oficina conservando identidad, contraseña, actividad y relaciones documentales.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param datos - Datos de entrada según el contrato tipado de esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function editar(id: string, datos: DatosUsuario, cliente: PoolClient): Promise<void> {
    await cliente.query(`UPDATE usuarios SET nombre=$2,apellido=$3,nombre_usuario=$4,email=$5,telefono=$6,rol_id=$7::bigint,oficina_id=$8::bigint
     WHERE id=$1::bigint`, [id, datos.nombre, datos.apellido, datos.nombre_usuario, datos.email, datos.telefono, datos.rol_id, datos.oficina_id]);
}
/** Incrementar la versión en la misma escritura invalida inmediatamente todos los JWT anteriores. */
export async function cambiarEstado(id: string, activo: boolean, cliente: PoolClient): Promise<void> {
    await cliente.query(`UPDATE usuarios SET activo=$2,
    version_autenticacion=version_autenticacion+CASE WHEN activo IS DISTINCT FROM $2 THEN 1 ELSE 0 END
    WHERE id=$1::bigint`, [id, activo]);
}
/**
 * Sustituye el hash e incrementa la versión de autenticación en una sola escritura para invalidar JWT anteriores.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param hash - Hash derivado previamente; no contiene la contraseña en texto claro.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function cambiarContrasena(id: string, hash: string, cliente: PoolClient): Promise<void> {
    await cliente.query("UPDATE usuarios SET contrasena_hash=$2,version_autenticacion=version_autenticacion+1 WHERE id=$1::bigint", [id, hash]);
}
