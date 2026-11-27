/** Archivo: Define los campos válidos del acceso, perfil y respuesta de sesión.
 */
import { z } from 'zod';
/** Contrato público emitido por Express. Los bigint llegan como texto para evitar pérdida de precisión. */
export const usuarioSchema = z.object({
  id: z.string().regex(/^[1-9][0-9]*$/),
  nombre: z.string(),
  apellido: z.string(),
  nombre_usuario: z.string(),
  email: z.string().nullable(),
  rol: z.string(),
  oficina: z.string().nullable(),
  rol_id: z.number().int().min(1).max(5).optional(),
  oficina_id: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .nullable()
    .optional()
    .default(null),
  ambito_id: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .nullable()
    .optional()
    .default(null),
});
/** Mantiene los límites del backend; nunca recorta ni normaliza la contraseña. */
export const loginSchema = z
  .object({
    identificador: z.string().trim().min(1, 'Ingresa tu usuario o correo.').max(254),
    contrasena: z.string().min(1, 'Ingresa tu contraseña.').max(1024),
  })
  .strict();
export const loginRespuestaSchema = z.object({
  token: z.string().min(1),
  tipo: z.literal('Bearer'),
  expiresIn: z.number().int().positive().max(2147483),
  usuario: usuarioSchema,
});
export const perfilRespuestaSchema = z.object({ usuario: usuarioSchema });
export type Usuario = z.infer<typeof usuarioSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
