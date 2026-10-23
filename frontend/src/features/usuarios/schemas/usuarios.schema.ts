import { z } from 'zod';
const id = z.string().regex(/^[1-9][0-9]*$/);
/**
 * Construye un campo de texto opcional con longitud máxima; recorta espacios y convierte el vacío en null para el contrato HTTP.
 * @param max - Longitud máxima del texto que admite el contrato.
 */
const opcional = (max: number) => z.string().trim().max(max).transform(/** Convierte el texto opcional vacío en null para el contrato. */  valor => valor || null);
/** Campos editables reales; el hash y la versión de autenticación no forman parte de este contrato. */
export const datosUsuarioSchema = z.object({
    nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(100),
    apellido: z.string().trim().min(1, 'El apellido es obligatorio').max(120),
    nombre_usuario: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/, 'Usa entre 3 y 64 letras minúsculas, números, punto, guion o guion bajo'),
    email: opcional(254).refine(/** Admite ausencia de correo o comprueba su estructura básica. */  valor => valor === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(valor), 'Correo electrónico inválido'),
    telefono: opcional(30),
    rol_id: id,
    oficina_id: z.string().transform(/** Convierte la oficina vacía en null cuando el contrato permite no asignarla. */  valor => valor || null).pipe(id.nullable()),
}).strict();
export const contrasenaSchema = z.string().min(8, 'La contraseña debe tener mínimo 8 caracteres').max(1024);
export const crearUsuarioSchema = datosUsuarioSchema.extend({ contrasena: contrasenaSchema, activo: z.boolean() }).strict();
export const restablecerSchema = z.object({ contrasena: contrasenaSchema }).strict();
export const usuarioSchema = z.object({
    id, nombre: z.string(), apellido: z.string(), nombre_usuario: z.string(), email: z.string().nullable(),
    telefono: z.string().nullable(), rol_id: id, oficina_id: id.nullable(), rol: z.string(), oficina: z.string().nullable(),
    activo: z.boolean(), fecha_creacion: z.iso.datetime({ offset: true }), fecha_modificacion: z.iso.datetime({ offset: true }),
});
export const respuestaUsuarioSchema = z.object({ usuario: usuarioSchema });
export const listaUsuariosSchema = z.object({
    usuarios: z.array(usuarioSchema), total: z.number().int().nonnegative(), pagina: z.number().int(), limite: z.number().int(),
});
export type UsuarioAdministrado = z.infer<typeof usuarioSchema>;
export type DatosUsuario = z.output<typeof datosUsuarioSchema>;
export type CrearUsuario = z.output<typeof crearUsuarioSchema>;
