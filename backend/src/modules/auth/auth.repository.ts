import { pool } from "../../config/database.js";
import type { UsuarioAuth } from "./auth.types.js";
const COLUMNAS = `
  u.id::text,
  u.nombre,
  u.apellido,
  u.nombre_usuario,
  u.email,
  u.contrasena_hash,
  u.activo,
  r.nombre AS rol,
  o.nombre AS oficina,
  u.version_autenticacion
`;
const JOINS = `
  FROM public.usuarios u
  JOIN public.roles r ON r.id = u.rol_id
  LEFT JOIN public.oficinas o ON o.id = u.oficina_id
`;
/**
 * Busca usuario/correo con un parámetro SQL; las interpolaciones son constantes internas.
 * Conserva la normalización existente: el CHECK de usuarios exige nombres en
 * minúsculas sin @, mientras los correos incluyen @ y se comparan con lower().
 */
export async function buscarPorIdentificador(identificador: string): Promise<UsuarioAuth | null> {
    const resultado = await pool.query<UsuarioAuth>(`SELECT ${COLUMNAS} ${JOINS}
     WHERE u.nombre_usuario = $1
        OR lower(u.email) = $1
     LIMIT 1`, [identificador.trim().toLowerCase()]);
    return resultado.rows[0] ?? null;
}
/** Consulta el bigint como texto para mantener precisión fuera del rango seguro de JavaScript. */
export async function buscarPorId(id: string): Promise<UsuarioAuth | null> {
    const resultado = await pool.query<UsuarioAuth>(`SELECT ${COLUMNAS} ${JOINS}
     WHERE u.id = $1::bigint`, [id]);
    return resultado.rows[0] ?? null;
}
