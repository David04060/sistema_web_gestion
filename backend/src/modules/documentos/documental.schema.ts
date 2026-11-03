import { z } from 'zod';
import { fechaRegistro } from './fecha-registro.js';
import { idSchema } from '../../shared/admin/admin.schema.js';

/** Contratos del circuito vigente: clasificación independiente del estado y delegación informativa. */
export const id = idSchema;
const texto = z.string().trim().max(20000).nullable().optional().default(null);
const motivo = z.string().trim().min(1).max(1000);
export const alta = z
  .object({
    tipo_id: id,
    clasificacion: z.enum(['RECIBIDO', 'EMITIDO']),
    asunto: z.string().trim().min(1).max(20000),
    remitente: texto,
    observaciones: texto,
    conservar_en_mesa: z.boolean().optional().default(false),
    unidad_id: id.nullable().optional(),
    origen_id: id.optional(),
    valores: z
      .array(z.object({ campo_id: id, valor: z.string().max(20000) }).strict())
      .max(100)
      .optional()
      .default([]),
  })
  .strict();
export const correccion = z
  .object({
    revision: id,
    motivo,
    asunto: z.string().trim().min(1).max(20000),
    remitente: texto,
    observaciones: texto,
    valores: z
      .array(z.object({ campo_id: id, valor: z.string().max(20000) }).strict())
      .max(100)
      .optional(),
  })
  .strict();
export const delegacion = z
  .object({
    revision: id,
    oficina_id: id.nullable().optional().default(null),
    usuario_id: id.nullable().optional().default(null),
    nombre: z.string().trim().min(1).max(250).nullable().optional().default(null),
    observaciones: texto,
  })
  .strict()
  .superRefine((v, c) => {
    if (
      (!v.usuario_id && !v.nombre) ||
      (v.usuario_id && v.nombre) ||
      (v.oficina_id && !v.usuario_id)
    )
      c.addIssue({
        code: 'custom',
        message: 'Seleccione una persona registrada o escriba su nombre; oficina sola no basta',
      });
  });
export const ubicacion = z.object({ revision: id, unidad_id: id }).strict();
export const anulacion = z.object({ revision: id, motivo }).strict();
export const filtros = z
  .object({
    q: z.string().trim().max(250).default(''),
    fecha: fechaRegistro.optional(),
    situacion: z
      .enum([
        'PENDIENTE_DIRECCION',
        'EN_MESA_DE_PARTES',
        'GUARDADO_DIRECCION',
        'PERSONAL',
        'DELEGADO',
        'ANULADO',
      ])
      .optional(),
    tipo_id: id.optional(),
    clasificacion: z.enum(['RECIBIDO', 'EMITIDO']).optional(),
    pagina: z.coerce.number().int().min(1).max(100000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
