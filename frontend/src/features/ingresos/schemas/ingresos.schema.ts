import { z } from 'zod';
const id = z.string().regex(/^[1-9][0-9]*$/);
const fecha = z.iso.datetime({ offset: true });
/** Presentación del trámite; no es identidad, autoría material ni código documental. */
export const ingresoSchema = z.object({
    id, referencia: z.string(), documento_id: id, registrado_por_id: id, registradora: z.string(),
    fecha_ingreso: fecha, fecha_presentacion: fecha, presentante: z.string(), procedencia: z.string(),
    proposito: z.string(), movimiento_recepcion_id: id.nullable(),
    ingreso_anterior_id: id.nullable().optional(), fecha_conclusion: fecha.nullable().optional(),
    concluido_por_id: id.nullable().optional(), concluido_por: z.string().nullable().optional(), motivo_conclusion: z.string().nullable().optional(), resultado: z.string().nullable().optional(),
    fecha_invalidacion: fecha.nullable().optional(), invalidado_por_id: id.nullable().optional(), invalidado_por: z.string().nullable().optional(), motivo_invalidacion: z.string().nullable().optional(), evidencia_resultado_id: id.nullable().optional(),
});
export const respuestaIngresoSchema = z.object({ documento_id: id, ingreso: ingresoSchema });
export const consultaIngresoSchema = z.object({ ingreso: ingresoSchema.nullable() });
export const entregaSchema = z.object({ entrega: z.object({
    movimiento_id: id, estado: z.enum(['EN_TRASLADO', 'RECIBIDO']), documento_id: id, codigo: z.string(),
    asunto: z.string(), remitente: z.string().nullable(), tipo_documental: z.string(), registrador: z.string(),
    registrado_por_id: id, responsable_actual_id: id, estado_tramite: z.string(), archivador_id: id.nullable(),
    activo: z.boolean(), archivo_id: id.nullable(), archivo_nombre: z.string().nullable(), archivo_responsable: z.string(),
    custodio: z.string(), oficina_custodia: z.string(), ubicacion: z.string().nullable(), fecha_recepcion: fecha.nullable(),
}) });
export const presentacionSchema = z.object({
    presentante: z.string().trim().min(1, 'Indique el presentante').max(250),
    procedencia: z.string().trim().min(1, 'Indique la procedencia').max(2000),
    proposito: z.string().trim().min(1, 'El propósito es obligatorio').max(20000),
    fecha_presentacion: fecha.optional(),
}).strict();
export type Ingreso = z.infer<typeof ingresoSchema>;

export const historiaSchema = z.object({ ingreso: ingresoSchema.nullable(), ingresos: z.array(ingresoSchema), total: z.number(), pagina: z.number(), limite: z.number(),
 capacidades: z.object({ ciclo_ordinario: z.boolean(), continuar: z.boolean(), evidencia: z.boolean(), concluir: z.boolean(), invalidar: z.boolean(), reingresar: z.boolean(), relevos: z.literal(false), sustituciones: z.literal(false) }) });
export const actuacionesSchema = z.object({ total: z.number(), pagina: z.number(), limite: z.number(), actuaciones: z.array(z.object({
 id, ingreso_id: id, registrado_por_id: id, tipo: z.enum(['CONTINUACION','EVIDENCIA_RESULTADO']), descripcion: z.string(),
 fecha_actuacion: fecha, responsable: z.string(), custodio_id: id.nullable(), oficina_id: id.nullable(), version_documental: z.string().nullable(), vigente: z.boolean() })) });
export const operacionSchema = z.object({ documento_id: id.optional(), ingreso_id: id.optional(), desenlace: z.enum(['CONCLUIDO','INVALIDADO']).optional(), actuacion: z.object({id}).optional() });

export const auditoriaSchema = z.object({total:z.number(),pagina:z.number(),limite:z.number(),auditoria:z.array(z.object({id,tabla:z.string(),registro_id:id,accion:z.string(),usuario_actor_id:id,responsable:z.string(),fecha,campos_modificados:z.record(z.string(),z.unknown())}))});
