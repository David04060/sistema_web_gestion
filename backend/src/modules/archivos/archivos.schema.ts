import { z } from 'zod';
import { idSchema, nombreCatalogo } from '../../shared/admin/admin.schema.js';

/** Solo admite metadatos administrativos; nunca custodia, documentos o períodos. */
export const metadatosSchema = z.object({
    nombre: nombreCatalogo(150),
    responsabilidad: z.string().trim().min(1).max(20000),
    motivo: z.string().trim().min(1, 'El motivo es obligatorio').max(1000),
}).strict();
export const crearSchema = metadatosSchema.extend({ oficina_id: idSchema, responsable_id: idSchema }).strict();
export const paginacionSchema = z.object({
    pagina: z.coerce.number().int().min(1).max(1000000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(10),
}).strict();
export const filtrosSchema = paginacionSchema.extend({
    q: z.string().trim().max(250).default(''),
    oficina_id: idSchema.optional(),
    responsable_id: idSchema.optional(),
}).strict();
export type Metadatos = z.infer<typeof metadatosSchema>;
export type Crear = z.infer<typeof crearSchema>;
export type Filtros = z.infer<typeof filtrosSchema>;
export type Paginacion = z.infer<typeof paginacionSchema>;
