/** Archivo: Define qué campos acepta el login y rechaza valores incompletos o adicionales.
 */
import { z } from 'zod';
/** Contraseña literal, identificador recortado y rechazo de campos adicionales. */
export const loginSchema = z
  .object({
    identificador: z.string().trim().min(1).max(254),
    contrasena: z.string().min(1).max(1024),
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;
