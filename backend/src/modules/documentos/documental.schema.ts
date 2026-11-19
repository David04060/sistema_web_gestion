import { z } from 'zod';
import { fechaRegistro } from './fecha-registro.js';
import { idSchema } from '../../shared/admin/admin.schema.js';

/** Contratos del circuito vigente: clasificación independiente del estado y delegación informativa. */
export const id = idSchema;
const texto = z.string().trim().max(20000).nullable().optional().default(null);
const motivo = z.string().trim().min(1).max(1000);
export const consultaDestinatarios = z.object({ q: z.string().trim().max(100).default(''), oficina_id: id.optional() }).strict();
export const consultaUbicaciones = z.object({ q: z.string().trim().max(250).default('') }).strict();
export const consultaOrigenes = z.object({ q: z.string().trim().max(250).default('') }).strict();
export const filtroRelacionados = z.union([z.boolean(),z.enum(['true','false']).transform(v=>v==='true')]).optional().default(false);

const destinoDelegacion = z
  .object({
    oficina_id: id.nullable().optional().default(null),
    usuario_id: id.nullable().optional().default(null),
    nombre: z.string().trim().min(1).max(250).nullable().optional().default(null),
    observaciones: texto,
  })
  .strict();

const validarDestino = (v: z.infer<typeof destinoDelegacion>, c: z.RefinementCtx) => {
    if (
      (!v.usuario_id && !v.nombre) ||
      (v.usuario_id && v.nombre) ||
      (v.oficina_id && !v.usuario_id)
    )
      c.addIssue({
        code: 'custom',
        message: 'Seleccione una persona registrada o escriba su nombre; oficina sola no basta',
      });
  };

export const delegacion = destinoDelegacion.extend({ revision: id }).superRefine(validarDestino);

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
    destino: destinoDelegacion.superRefine(validarDestino).optional(),
  })
  .strict();
export const correccion = z
  .object({
    revision: id,
    motivo,
    asunto: z.string().trim().min(1).max(20000),
    remitente: texto,
    observaciones: texto,
  })
  .strict();
export const ubicacion = z.object({ revision: id, unidad_id: id }).strict();
export const anulacion = z.object({ revision: id, motivo }).strict();
export const filtros = z
  .object({
    q: z.string().trim().max(250).default(''),
    con_relacionados: filtroRelacionados,
    fecha: fechaRegistro.optional(),
    situacion: z
      .enum([
        'PENDIENTE_DIRECCION',
        'EN_MESA_DE_PARTES',
        'GUARDADO_DIRECCION',
        'PERSONAL',
        'DELEGADO',
        'DELEGADO_A_MI',
        'DELEGADO_POR_MI',
        'EN_MI_OFICINA',
        'ANULADO',
      ])
      .optional(),
    tipo_id: id.optional(),
    clasificacion: z.enum(['RECIBIDO', 'EMITIDO']).optional(),
    pagina: z.coerce.number().int().min(1).max(100000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
