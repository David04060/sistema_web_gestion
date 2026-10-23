import type { PoolClient } from 'pg';
import { pool } from '../../config/database.js';
import type { DatosTipo } from './tipos-documentales.schema.js';
export interface TipoDocumental extends DatosTipo {
    id: string;
    requiere_clave: boolean;
    prefijo_protegido: boolean;
    fecha_creacion: string;
    fecha_modificacion: string;
}
const proyeccion = `t.id::text,t.nombre,t.prefijo_codigo,t.requiere_clave,
  to_jsonb(t.fecha_creacion)#>>'{}' AS fecha_creacion,
  to_jsonb(t.fecha_modificacion)#>>'{}' AS fecha_modificacion,
  (CASE WHEN t.requiere_clave OR lower(btrim(t.nombre))='síseve' THEN true
   ELSE EXISTS(SELECT 1 FROM documentos d WHERE d.tipo_documental_id=t.id)
   OR EXISTS(SELECT 1 FROM correlativos_documentales c WHERE c.tipo_documental_id=t.id) END) AS prefijo_protegido`;
/** En tipos restringidos la proteccion es constante: no revela si ya existen documentos o correlativos. */
export async function listar() {
    return (await pool.query<TipoDocumental>(`SELECT ${proyeccion} FROM tipos_documentales t ORDER BY nombre,id`)).rows;
}
/**
 * Obtiene el tipo por ID con la misma proyección protegida del listado; devuelve undefined si no existe.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function obtener(id: string, cliente?: PoolClient) {
    return (await (cliente ?? pool).query<TipoDocumental>(`SELECT ${proyeccion} FROM tipos_documentales t WHERE t.id=$1::bigint`, [id])).rows[0];
}
/** FOR UPDATE coordina el cambio de prefijo con el FOR SHARE del generador SQL existente. */
export async function bloquear(id: string, cliente: PoolClient) {
    await cliente.query('SELECT id FROM tipos_documentales WHERE id=$1::bigint FOR UPDATE', [id]);
}
/**
 * Comprueba nombre normalizado o prefijo repetido excluyendo el ID editado dentro de la transacción administrativa.
 * @param datos - Datos de entrada según el contrato tipado de esta operación.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function duplicado(datos: DatosTipo, id: string | null, cliente: PoolClient) {
    return (await cliente.query(`SELECT id FROM tipos_documentales WHERE ($3::bigint IS NULL OR id<>$3::bigint)
    AND (lower(regexp_replace(btrim(nombre),'[[:space:]]+',' ','g'))=lower($1)
      OR ($2::text IS NOT NULL AND prefijo_codigo=$2)) LIMIT 1`, [datos.nombre, datos.prefijo_codigo, id])).rowCount !== 0;
}
/**
 * Inserta nombre y prefijo o actualiza el tipo existente; conserva los campos de seguridad fuera del cuerpo editable y devuelve el ID.
 * @param datos - Datos de entrada según el contrato tipado de esta operación.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
 */
export async function guardar(datos: DatosTipo, id: string | null, cliente: PoolClient) {
    if (id) {
        await cliente.query('UPDATE tipos_documentales SET nombre=$2,prefijo_codigo=$3 WHERE id=$1::bigint', [id, datos.nombre, datos.prefijo_codigo]);
        return id;
    }
    return (await cliente.query<{
        id: string;
    }>('INSERT INTO tipos_documentales(nombre,prefijo_codigo,requiere_clave) VALUES($1,$2,false) RETURNING id::text', [datos.nombre, datos.prefijo_codigo])).rows[0]!.id;
}
