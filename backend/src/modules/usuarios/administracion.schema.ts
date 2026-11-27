/** Archivo: Define los campos admitidos al administrar cuentas, oficinas, tipos y ubicaciones.
 */
import { z } from 'zod';
import { idSchema as id } from '../../shared/admin/admin.schema.js';

/** Contratos estrictos del backend vigente; no aceptan cambios de propietario implícitos. */
export const usuarioAlta = z
  .object({
    nombre: z.string().trim().min(1).max(150),
    apellido: z.string().trim().min(1).max(150),
    nombre_usuario: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{3,80}$/),
    email: z.email().nullable().optional().default(null),
    telefono: z.string().max(50).nullable().optional().default(null),
    rol_id: z.number().int().min(1).max(5),
    oficina_id: id.nullable().optional().default(null),
    contrasena: z
      .string()
      .min(8, 'La contraseña debe tener mínimo 8 caracteres')
      .max(128, 'La contraseña debe tener máximo 128 caracteres'),
  })
  .strict();
export const usuarioEdicion = usuarioAlta
  .omit({ contrasena: true })
  .extend({ motivo: z.string().trim().min(1).max(1000) })
  .strict();
export const nombre = z.object({ nombre: z.string().trim().min(1).max(250) }).strict();
export const tipo = z
  .object({
    nombre: z.string().trim().min(1).max(250),
    prefijo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2,8}$/),
  })
  .strict();
export const tipoEdicion = tipo
  .extend({
    activo: z.boolean(),
    motivo: z.string().trim().min(1).max(1000),
  })
  .strict();
export const motivoTipo = z.object({ motivo: z.string().trim().min(1).max(1000) }).strict();
export const unidad = z
  .object({
    propietario_id: id.optional(),
    clase: z.string().trim().min(1).max(100),
    nombre: z.string().trim().min(1).max(250),
    padre_id: id.nullable().optional().default(null),
  })
  .strict();
export const renombrar = z
  .object({ nombre: z.string().trim().min(1).max(250), motivo: z.string().trim().min(1).max(1000) })
  .strict();
export const oficinaEdicion = renombrar;
export const oficinaActividad = z
  .object({ activa: z.boolean(), motivo: z.string().trim().min(1).max(1000) })
  .strict();
export const actividad = z
  .object({ activo: z.boolean(), motivo: z.string().trim().min(1).max(1000) })
  .strict();
export const filtrosUsuarios = z
  .object({
    q: z.string().trim().max(250).default(''),
    rol_id: z.coerce.number().int().min(1).max(5).optional(),
    activo: z.enum(['true', 'false']).optional(),
  })
  .strict();
