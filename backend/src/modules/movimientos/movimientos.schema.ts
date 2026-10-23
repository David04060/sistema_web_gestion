import { z } from 'zod';
import { idSchema } from '../../shared/admin/admin.schema.js';
import { motivoSchema } from '../documentos/documentos.schema.js';
/** Nunca admite autor, oficina de origen, estado ni fechas desde la petición. */
export const derivarSchema = z.object({ documento_id: idSchema, usuario_destino_id: idSchema, motivo: motivoSchema }).strict();
export const recepcionSchema = z.object({ archivador_id: idSchema.nullable() }).strict();
export const motivoMovimientoSchema = z.object({ motivo: motivoSchema }).strict();
export const filtrosSchema = z.object({ documento_id: idSchema.optional(), bandeja: z.enum(['entrada', 'salida', 'recuperacion']).optional(), estado: z.enum(['EN_TRASLADO', 'RECIBIDO', 'RECHAZADO', 'CANCELADO']).optional(), pagina: z.coerce.number().int().min(1).max(1000000).default(1), limite: z.coerce.number().int().min(1).max(100).default(10) }).strict();
export type Filtros = z.infer<typeof filtrosSchema>;
export const recuperacionSchema = z.object({ archivador_id: idSchema.nullable(), motivo: motivoSchema, confirmar_recuperacion: z.literal(true) }).strict();
