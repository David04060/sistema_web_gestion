import { z } from "zod";
import { idSchema } from "../../shared/admin/admin.schema.js";
/**
 * Construye un campo nullable acotado que recorta espacios y convierte texto vacío en null; no admite undefined.
 * @param max - Longitud máxima del texto que admite el contrato.
 */
const opcional = (max: number) => z.string().trim().max(max).transform(/** Normaliza un campo opcional vacío a null para el contrato persistido. */  valor => valor || null).nullable();
const emailSchema = opcional(254).refine(/** Admite correo ausente o comprueba su estructura básica antes de persistirlo. */  valor => valor === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(valor), "Correo electrónico inválido");
/** Coincide con los límites y CHECK existentes; no acepta activo, hash ni versión en la edición personal. */
export const datosUsuarioSchema = z.object({
    nombre: z.string().trim().min(1).max(100),
    apellido: z.string().trim().min(1).max(120),
    nombre_usuario: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/, "Usa de 3 a 64 letras minúsculas, números, punto, guion o guion bajo"),
    email: emailSchema,
    telefono: opcional(30),
    rol_id: idSchema,
    oficina_id: idSchema.nullable(),
}).strict();
/** Mantiene el mínimo vigente de scrypt; el máximo coincide con el contrato del login. */
export const contrasenaSchema = z.string().min(8, "La contraseña debe tener mínimo 8 caracteres").max(1024);
export const crearUsuarioSchema = datosUsuarioSchema.extend({ contrasena: contrasenaSchema, activo: z.boolean().default(true) }).strict();
export const estadoSchema = z.object({ activo: z.boolean() }).strict();
export const restablecerSchema = z.object({ contrasena: contrasenaSchema }).strict();
export const filtrosSchema = z.object({
    q: z.string().trim().max(254).default(""),
    rol_id: idSchema.optional(),
    oficina_id: idSchema.optional(),
    activo: z.enum(["true", "false"]).optional(),
    pagina: z.coerce.number().int().min(1).max(1000000).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(10),
}).strict();
export type DatosUsuario = z.infer<typeof datosUsuarioSchema>;
export type CrearUsuario = z.infer<typeof crearUsuarioSchema>;
export type FiltrosUsuarios = z.infer<typeof filtrosSchema>;
