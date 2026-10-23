import { z } from 'zod';
/** Contrato de los catálogos administrativos; reservado es política, no una columna adicional. */
export const registroCatalogoSchema = z.object({
    id: z.string().regex(/^[1-9][0-9]*$/), nombre: z.string(), fecha_creacion: z.iso.datetime({ offset: true }), fecha_modificacion: z.iso.datetime({ offset: true }),
    usuarios_asociados: z.number().int().nonnegative(), reservado: z.boolean(),
});
export const asociadoSchema = z.object({ id: z.string(), nombre: z.string(), apellido: z.string(), nombre_usuario: z.string(), activo: z.boolean() });
export const detalleCatalogoSchema = z.object({ registro: registroCatalogoSchema, usuarios: z.array(asociadoSchema) });
export const guardarCatalogoRespuestaSchema = z.object({ registro: registroCatalogoSchema });
export type RegistroCatalogo = z.infer<typeof registroCatalogoSchema>;
