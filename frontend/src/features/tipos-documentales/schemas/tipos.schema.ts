import { z } from 'zod';
/** Metadatos compartidos; no se reciben documentos, claves ni autorizaciones. */
export const tipoSchema = z.object({ id: z.string(), nombre: z.string(), prefijo_codigo: z.string().nullable(), requiere_clave: z.boolean(), prefijo_protegido: z.boolean(), fecha_creacion: z.iso.datetime({ offset: true }), fecha_modificacion: z.iso.datetime({ offset: true }) });
export const formularioTipoSchema = z.object({ nombre: z.string().trim().min(1, 'Indica el nombre').max(120).transform(/** Colapsa espacios interiores del nombre del tipo. */  v => v.replace(/\s+/gu, ' ')), prefijo_codigo: z.string().trim().toUpperCase().refine(/** Admite prefijo vacío o de dos a ocho letras mayúsculas. */  v => v === '' || /^[A-Z]{2,8}$/.test(v), 'Usa entre 2 y 8 letras').transform(/** Convierte el prefijo vacío en null según el contrato HTTP. */  v => v || null) });
export type TipoDocumental = z.infer<typeof tipoSchema>;
export type FormularioTipo = z.input<typeof formularioTipoSchema>;
