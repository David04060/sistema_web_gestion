/** Archivo: Valida nombre, tamaño, tipo y revisión del PDF antes de preparar una carga.
 */
import { z } from 'zod';
export const MAX_PDF = 15 * 1024 * 1024;
export const revisionSchema = z.uuid().nullable();
export const iniciarSchema = z
  .object({
    nombre: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/\.pdf$/i)
      .refine(
        (v) => ![...v].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || '/\\'.includes(c)),
        'Nombre inválido',
      ),
    tamano: z.number().int().min(1).max(MAX_PDF),
    mime: z.literal('application/pdf'),
    revision: revisionSchema,
  })
  .strict();
export const confirmarSchema = z.object({ carga: z.uuid() }).strict();
export const eliminarSchema = z.object({ revision: z.uuid(), confirmar: z.literal(true) }).strict();
export const abrirSchema = z.object({ descargar: z.boolean() }).strict();
