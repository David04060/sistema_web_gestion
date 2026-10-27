import { z } from 'zod';
const id = z.string().regex(/^[1-9][0-9]*$/);
const fecha = z.iso.datetime({ offset: true });
export const archivoSchema = z.object({
    id, nombre: z.string(), responsabilidad: z.string(), oficina_id: id, oficina: z.string(),
    creado_por_id: id, creador: z.string(), fecha_creacion: fecha, motivo: z.string(),
    asignacion_id: id, responsable_id: id, responsable: z.string(), fecha_inicio: fecha,
});
export const respuestaSchema = z.object({ archivo: archivoSchema });
const paginacion = { total: z.number().int().nonnegative(), pagina: z.number().int().positive(), limite: z.number().int().positive() };
export const listaSchema = z.object({ archivos: z.array(archivoSchema), ...paginacion });
export const historialSchema = z.object({ asignaciones: z.array(z.object({
    id, responsable_id: id, responsable: z.string(), fecha_inicio: fecha, fecha_fin: fecha.nullable(),
    formalizado_por_id: id, formalizador: z.string(), motivo: z.string(),
    finalizado_por_id: id.nullable(), finalizador: z.string().nullable(), motivo_fin: z.string().nullable(),
})), ...paginacion });
/** El PUT contiene exclusivamente estos tres campos. */
export const metadatosSchema = z.object({
    nombre: z.string().trim().transform(v => v.replace(/\s+/gu, ' ')).pipe(z.string().min(1, 'Escribe el nombre del archivo.').max(150)),
    responsabilidad: z.string().trim().min(1, 'Describe la responsabilidad o finalidad.').max(20000),
    motivo: z.string().trim().min(1, 'Explica el motivo del registro o la corrección.').max(1000),
}).strict();
export const crearSchema = metadatosSchema.extend({ oficina_id: id, responsable_id: id }).strict();
export type Archivo = z.infer<typeof archivoSchema>;
export type Metadatos = z.infer<typeof metadatosSchema>;
export type Crear = z.infer<typeof crearSchema>;
