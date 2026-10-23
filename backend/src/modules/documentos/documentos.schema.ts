import { z } from 'zod';
import { idSchema } from '../../shared/admin/admin.schema.js';
/** Motivo exigido por fn_documentos_auditar; no se aceptan campos generados ni de custodia. */
export const motivoSchema = z.string().trim().min(1, 'El motivo es obligatorio').max(1000);
/**
 * Construye un campo textual acotado y nullable; recorta espacios y convierte cadenas vacías en null.
 * @param max - Longitud máxima del texto que admite el contrato.
 */
const textoOpcional = (max: number) => z.string().trim().max(max).transform(/** Convierte el contenido opcional vacío en null después de recortar espacios. */  v => v || null).nullable();
export const contenidoSchema = z.object({ asunto: z.string().trim().min(1, 'El asunto es obligatorio').max(20000), remitente: textoOpcional(250), observaciones: textoOpcional(20000) }).strict();
export const registrarSchema = contenidoSchema.extend({ tipo_documental_id: idSchema, archivador_id: idSchema.nullable() }).strict();
export const corregirSchema = contenidoSchema.extend({ motivo: motivoSchema }).strict();
export const anularSchema = z.object({ motivo: motivoSchema }).strict();
export const filtrosSchema = z.object({ q: z.string().trim().max(250).default(''), tipo_documental_id: idSchema.optional(), oficina_id: idSchema.optional(), responsable_id: idSchema.optional(), archivador_id: idSchema.optional(), estado: z.enum(['PENDIENTE_DECISION', 'EN_TRASLADO', 'RECIBIDO', 'RECHAZADO', 'CANCELADO']).optional(), activo: z.enum(['true', 'false']).optional(), pagina: z.coerce.number().int().min(1).max(1000000).default(1), limite: z.coerce.number().int().min(1).max(100).default(10) }).strict();
export type Contenido = z.infer<typeof contenidoSchema>;
export type Registrar = z.infer<typeof registrarSchema>;
export type Filtros = z.infer<typeof filtrosSchema>;
export const autorizarSchema = z.object({ usuario_destino_id: idSchema, motivo: motivoSchema }).strict();
