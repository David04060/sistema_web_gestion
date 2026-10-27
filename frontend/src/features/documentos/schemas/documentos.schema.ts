import { z } from 'zod';
const id = z.string().regex(/^[1-9][0-9]*$/);
export const estadoDocumentoSchema = z.enum(['PENDIENTE_DECISION', 'EN_TRASLADO', 'RECIBIDO', 'RECHAZADO', 'CANCELADO']);
const fecha = z.iso.datetime({ offset: true });
/** Los identificadores permanecen como texto y nunca se confía en respuestas HTTP sin validar. */
export const documentoSchema = z.object({ id, codigo: z.string(), destinatario_autorizado_id: id.nullable(), oficina_destino_autorizada_id: id.nullable(), decision_autorizada_por_id: id.nullable(), tipo_documental_id: id, tipo_documental: z.string(), asunto: z.string(), remitente: z.string().nullable(), observaciones: z.string().nullable(), archivador_id: id.nullable(), registrado_por_id: id, registrador: z.string(), responsable_actual_id: id, responsable: z.string(), oficina_responsable_id: id, oficina: z.string(), estado_tramite: estadoDocumentoSchema, activo: z.boolean(), estante_id: id.nullable(), estante: z.string().nullable(), archivador_numero: z.number().int().nullable(), fecha_creacion: fecha, fecha_modificacion: fecha });
export const historialSchema = z.object({ id, accion: z.string(), usuario_actor_id: id.nullable(), actor: z.string(), fecha, campos_modificados: z.record(z.string(), z.unknown()) });
export const listaDocumentosSchema = z.object({ documentos: z.array(documentoSchema), total: z.number().int().nonnegative(), pagina: z.number().int(), limite: z.number().int() });
export type Documento = z.infer<typeof documentoSchema>;
export const permisosSchema = z.object({ editar: z.boolean(), anular: z.boolean(), autorizar: z.boolean(), salir: z.boolean(), solicitar_decision: z.boolean() });
export const detalleDocumentoSchema = z.object({ documento: documentoSchema.extend({ permisos: permisosSchema, ultima_ubicacion: z.object({ nombre: z.string(), fecha }).nullable() }) });
export const opcionesSchema = z.object({ tipos: z.array(z.object({ id, nombre: z.string(), prefijo_codigo: z.string().nullable() })), destinatarios: z.array(z.object({ id, nombre: z.string(), oficina_id: id, oficina: z.string() })), archivadores: z.array(z.object({ id, nombre: z.string() })), filtros: z.array(z.object({ oficina_id: id, oficina: z.string(), responsable_id: id, responsable: z.string(), archivador_id: id.nullable(), ubicacion: z.string() })), puede_registrar: z.boolean() });
export const formularioDocumentoSchema = z.object({ tipo_documental_id: id, asunto: z.string().trim().min(1, 'El asunto es obligatorio').max(20000), remitente: z.string().trim().max(250), observaciones: z.string().trim().max(20000), archivador_id: z.string(), motivo: z.string().trim().max(1000) });
export type FormularioDocumento = z.infer<typeof formularioDocumentoSchema>;
