/** Archivo: Comprueba una entrada con su esquema y comunica qué campo no cumple las reglas.
 */
import type { ZodType } from 'zod';
import { HttpError } from './HttpError.js';
/** Valida sin devolver valores privados del cuerpo; informa rutas de campos y mensajes del esquema. */
export function validar<T>(schema: ZodType<T>, datos: unknown): T {
  const resultado = schema.safeParse(datos);
  if (!resultado.success) {
    throw new HttpError(
      400,
      resultado.error.issues
        .map((issue) => `${issue.path.join('.') || 'solicitud'}: ${issue.message}`)
        .join('; '),
    );
  }
  return resultado.data;
}
