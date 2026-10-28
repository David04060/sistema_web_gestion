import { z } from 'zod';
const indicador = z.object({ clave: z.string(), etiqueta: z.string(), total: z.number().int().nonnegative() });
const entrada = z.object({ id: z.string(), codigo: z.string(), estado: z.string(), clasificacion_registro: z.enum(['RECIBIDO','EMITIDO']).nullable().optional(), activo: z.boolean().optional(), fecha: z.string(), ruta: z.string().regex(/^\/(documentos|movimientos)\/[1-9][0-9]*$/) });
/** Valida el contrato recibido antes de mostrar indicadores y enlaces. */
export const dashboardSchema = z.object({
    atencion:z.object({titulo:z.string(),situacion:z.enum(['PENDIENTE_DECISION','DELEGADO']),total:z.number().int().nonnegative(),documentos:z.array(entrada.extend({asunto:z.string(),tipo_documental:z.string(),destinatario:z.string().nullable()})).max(8)}).nullable().default(null),
    alcance: z.enum(['administrativo', 'institucional', 'personal']), actualizado: z.string(),
    indicadores: z.array(indicador), estados: z.array(indicador), operaciones: z.array(indicador),
    recientes: z.array(entrada), pendientes: z.array(entrada),
    accesos: z.array(z.object({ etiqueta: z.string(), ruta: z.enum(['/usuarios', '/oficinas', '/roles', '/tipos-documentales', '/documentos', '/movimientos', '/documentos/nuevo', '/documentos/nuevo?clasificacion=RECIBIDO', '/documentos/nuevo?clasificacion=EMITIDO', '/ubicaciones']) })),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
