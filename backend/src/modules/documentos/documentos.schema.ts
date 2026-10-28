import {delegacionPersonalSchema} from './delegacion-personal.js';
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
/** Clasificación del registro: nunca se deriva del tipo ni del estado de circulación. */
export const clasificacionRegistroSchema = z.enum(['RECIBIDO', 'EMITIDO']);
export const corregirSchema = contenidoSchema.extend({ motivo: motivoSchema }).strict();
export const anularSchema = z.object({ motivo: motivoSchema }).strict();
export const filtrosSchema = z.object({ situacion: z.enum(['PENDIENTE_DECISION','DELEGADO','ENTREGADO','GUARDADO_DIRECCION','GUARDADO_SECRETARIA']).optional(), q: z.string().trim().max(250).default(''), tipo_documental_id: idSchema.optional(), oficina_id: idSchema.optional(), responsable_id: idSchema.optional(), archivador_id: idSchema.optional(), estado: z.enum(['PENDIENTE_DECISION', 'EN_TRASLADO', 'RECIBIDO', 'RECHAZADO', 'CANCELADO']).optional(), activo: z.enum(['true', 'false']).optional(), pagina: z.coerce.number().int().min(1).max(1000000).default(1), limite: z.coerce.number().int().min(1).max(100).default(10) }).strict();
export type Contenido = z.infer<typeof contenidoSchema>;
export type Filtros = z.infer<typeof filtrosSchema>;
export const autorizarSchema = z.object({ usuario_destino_id: idSchema, motivo: motivoSchema }).strict();

/** Revisión optimista evita confirmar un destinatario cambiado en otra sesión. */
export const asignarSchema = z.object({ tipo: z.enum(['OFICINA','USUARIO','PERSONA']).optional(), oficina_id: idSchema.nullable(), usuario_id: idSchema.nullable(), nombre: z.string().trim().min(1).max(250).nullable(), observaciones: textoOpcional(20000).optional().default(null), revision: z.number().int().nonnegative() }).strict().superRefine((d,c) => {
 if ((!d.oficina_id&&!d.usuario_id&&!d.nombre)||(d.usuario_id&&d.nombre)) c.addIssue({code:'custom',message:'Indique oficina o persona; seleccione un usuario o escriba un nombre'});
}).transform(d=>({...d,tipo:d.usuario_id?'USUARIO' as const:d.nombre?'PERSONA' as const:'OFICINA' as const}));
export const guardarDireccionSchema = z.object({estante_id:idSchema,archivador_id:idSchema,revision:z.number().int().nonnegative()}).strict();
export const confirmarEntregaSchema = z.object({revision:z.number().int().nonnegative()}).strict();

/** La decisión inicial usa las mismas formas de destino y ubicación que el detalle. */
const delegarInicialSchema = z.object({accion:z.literal('DELEGAR'),oficina_id:idSchema.nullable(),usuario_id:idSchema.nullable(),nombre:z.string().trim().min(1).max(250).nullable(),observaciones:textoOpcional(20000).optional().default(null)}).strict().superRefine((d,c)=>{
 if((!d.oficina_id&&!d.usuario_id&&!d.nombre)||(d.usuario_id&&d.nombre))c.addIssue({code:'custom',message:'Indique oficina o persona; seleccione un usuario o escriba un nombre'});
});
export const decisionInicialSchema = z.discriminatedUnion('accion',[
 delegarInicialSchema,
 guardarDireccionSchema.omit({revision:true}).extend({accion:z.literal('GUARDAR_DIRECCION')}).strict(),
]);
export const registrarSchema = contenidoSchema.extend({tipo_documental_id:idSchema,archivador_id:idSchema.nullable(),documento_origen_id:idSchema.optional(),clasificacion_registro:clasificacionRegistroSchema,delegacion_personal:delegacionPersonalSchema.optional(),decision_inicial:decisionInicialSchema.optional()}).strict();
export type Registrar = z.infer<typeof registrarSchema>;
