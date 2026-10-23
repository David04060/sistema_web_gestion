import { z } from 'zod';
import { idSchema } from '../../shared/admin/admin.schema.js';
export const claveOperacionSchema = z.string().min(1).max(1024);
export const autorizacionSchema = z.object({ usuario_id: idSchema, activo: z.boolean() }).strict();
export const claveNuevaSchema = z.object({ contrasena: z.string().min(8).max(1024) }).strict();
/** El secreto viaja solo en body; la operacion selecciona un contrato estricto independiente. */
export const operacionSchema = z.object({ clave: claveOperacionSchema, operacion: z.enum(['listar', 'detalle', 'historial', 'opciones', 'registrar', 'corregir', 'anular', 'autorizar', 'retirar-autorizacion', 'solicitar-decision', 'movimientos', 'movimiento', 'salir', 'recibir', 'rechazar', 'recuperar', 'cancelar']), id: idSchema.optional(), datos: z.unknown().optional() }).strict();
export type Operacion = z.infer<typeof operacionSchema>;
export const sinDatosSchema = z.object({}).strict();
