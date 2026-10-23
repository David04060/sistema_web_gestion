import { z } from 'zod';
import { idSchema } from '../../shared/admin/admin.schema.js';
/** Se respeta la nomenclatura que exige PostgreSQL, sin inventar códigos automáticos. */
export const estanteSchema = z.object({ codigo: z.string().trim().toUpperCase().regex(/^[A-Z]{1,10}$/, 'Usa de 1 a 10 letras'), usuario_id: idSchema, oficina_id: idSchema }).strict();
export const archivadorSchema = z.object({ estante_id: idSchema, numero: z.number().int().min(1).max(2147483647) }).strict();
export const filtrosSchema = z.object({ oficina_id: idSchema.optional(), usuario_id: idSchema.optional(), estante_id: idSchema.optional() }).strict();
export type EstanteDatos = z.infer<typeof estanteSchema>;
export type ArchivadorDatos = z.infer<typeof archivadorSchema>;
export type Filtros = z.infer<typeof filtrosSchema>;
