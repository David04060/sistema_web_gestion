/** Archivo: Valida identificadores y normaliza nombres de catálogos sin cambiar su significado.
 */
import { z } from 'zod';
/** Los bigint viajan como texto; se rechazan cero, negativos y desbordamientos antes de SQL. */
export const idSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  /**
   * Comprueba formato y rango bigint antes de convertir, evitando excepciones con identificadores
   * inválidos.
   */
  .refine(
    (valor) => /^[1-9][0-9]{0,18}$/.test(valor) && BigInt(valor) <= 9223372036854775807n,
    'Identificador fuera de rango',
  );
export const parametroIdSchema = z.object({ id: idSchema });
/** Normaliza espacios de nombres de catálogo, sin cambiar su escritura institucional. */
export const nombreCatalogo = (max: number) =>
  z
    .string()
    .trim()
    /** Colapsa espacios interiores del nombre del catálogo antes de comprobar su longitud. */
    .transform((valor) => valor.replace(/\s+/gu, ' '))
    .pipe(z.string().min(1, 'El nombre es obligatorio').max(max));
/**
 * Obtiene la representación canónica del nombre para comparar reservas sin diferencias de espacios ni
 * mayúsculas.
 * @param nombre - Denominación del registro que se consulta o conserva.
 */
export function nombreCanonico(nombre: string): string {
  return nombre.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('es');
}
