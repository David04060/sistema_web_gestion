import { z } from 'zod';
import { nombreCatalogo } from '../../shared/admin/admin.schema.js';
/** El catálogo no administra claves ni autorizaciones documentales. */
export const guardarTipoSchema = z.object({
    nombre: nombreCatalogo(120),
    prefijo_codigo: z.string().trim().toUpperCase().regex(/^[A-Z]{2,8}$/, 'El prefijo requiere entre 2 y 8 letras').nullable(),
}).strict();
export type DatosTipo = z.infer<typeof guardarTipoSchema>;
