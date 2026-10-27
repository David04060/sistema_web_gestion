import { z } from 'zod';
import { idSchema } from '../../shared/admin/admin.schema.js';
import { registrarSchema } from '../documentos/documentos.schema.js';

/** Fecha de presentación opcional; al omitirse se utiliza el hecho físico registrado. */
export const presentacionSchema = z.object({
    presentante: z.string().trim().min(1, 'Indique el presentante').max(250),
    procedencia: z.string().trim().min(1, 'Indique la procedencia').max(2000),
    proposito: z.string().trim().min(1, 'El propósito es obligatorio').max(20000),
    fecha_presentacion: z.iso.datetime({ offset: true }).optional(),
}).strict();
export const recibirIngresoSchema = presentacionSchema.extend({
    archivador_id: idSchema.nullable(), confirmar_recepcion: z.literal(true),
}).strict();
export const externoSchema = registrarSchema.extend({
    solicitud_id: z.uuid(),
    archivo_id: idSchema, remitente: z.string().trim().min(1, 'Indique el remitente externo').max(250),
    presentacion: presentacionSchema,
}).strict();
export type Presentacion = z.infer<typeof presentacionSchema>;
export type Externo = z.infer<typeof externoSchema>;

export const paginaSchema = z.object({ pagina: z.coerce.number().int().min(1).max(100000).default(1), limite: z.coerce.number().int().min(1).max(50).default(10) }).strict();
export const actuacionSchema = z.object({ descripcion: z.string().trim().min(1).max(20000) }).strict();
export const evidenciaSchema = actuacionSchema.extend({ confirmar_tenencia: z.literal(true) }).strict();
export const concluirSchema = z.object({ motivo: z.string().trim().min(1).max(1000), evidencia_id: idSchema, confirmar: z.literal(true) }).strict();
export const invalidarSchema = z.object({ motivo: z.string().trim().min(1).max(1000), confirmar: z.literal(true) }).strict();
export const reingresoSchema = presentacionSchema.omit({ fecha_presentacion: true }).extend({ ingreso_anterior_id: idSchema,
    confirmar_presentacion: z.literal(true), movimiento_recepcion_id: idSchema.optional() }).strict();
export const contextoSchema = z.object({ id: idSchema, ingreso: idSchema });
