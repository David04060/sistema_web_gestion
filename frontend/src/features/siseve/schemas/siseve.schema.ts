import { z } from 'zod';
export { accesoSchema } from './acceso.schema';
export const administracionSchema = z.object({ configuracion: z.object({ id: z.string(), prefijo_codigo: z.string().nullable(), clave_configurada: z.boolean() }), usuarios: z.array(z.object({ usuario_id: z.string(), nombre: z.string(), cuenta_activa: z.boolean(), autorizado: z.boolean(), fecha_autorizacion: z.string().nullable(), fecha_revocacion: z.string().nullable() })) });
export const solicitudSchema = z.object({ operacion: z.string().min(1), clave: z.string().min(1, 'Ingrese la contraseña adicional').max(1024), id: z.string(), asunto: z.string().max(20000), remitente: z.string().max(250), observaciones: z.string().max(20000), archivador_id: z.string(), usuario_destino_id: z.string(), motivo: z.string().trim().max(1000), q: z.string().max(250), estado: z.string(), pagina: z.string(), confirmado: z.boolean() });
export type Solicitud = z.infer<typeof solicitudSchema>;
