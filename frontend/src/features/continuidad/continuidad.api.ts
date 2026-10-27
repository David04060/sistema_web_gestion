import {z} from 'zod';
import {apiRequest} from '../../api/client';
const id=z.string(),fecha=z.string();
export const capacidadesSchema=z.object({archivos:z.boolean(),primer_ingreso:z.boolean(),ciclo_ingresos:z.boolean(),relevos:z.boolean(),sustituciones:z.boolean(),correcciones_versionadas:z.boolean(),version:z.string()});
export const capacidades=(token:string)=>apiRequest('/api/sistema/capacidades',capacidadesSchema,{},token);
const relevo=z.object({id,archivo_id:id,archivo:z.string(),responsable_saliente_id:id,responsable_entrante_id:id,saliente:z.string(),entrante:z.string(),formalizador:z.string(),motivo:z.string(),fecha_formalizacion:fecha,fecha_aceptacion:fecha.nullable()});
const pagina={total:z.number(),pagina:z.number(),limite:z.number()};
export const relevos=(token:string,p:number)=>apiRequest(`/api/continuidad/relevos?pagina=${p}`,z.object({relevos:z.array(relevo),...pagina,puede_formalizar:z.boolean(),puede_autorizar_sustitucion:z.boolean(),actor_id:id}),{},token);
export const originales=(token:string,relevo:string,p:number)=>apiRequest(`/api/continuidad/relevos/${relevo}/originales?pagina=${p}`,z.object({originales:z.array(z.object({id,codigo:z.string(),asunto:z.string(),archivador_id:id.nullable(),disponible:z.boolean()})),...pagina}),{},token);
const sustitucion=z.object({id,movimiento_id:id,documento_id:id,codigo:z.string(),estado_movimiento:z.enum(['EN_TRASLADO','RECIBIDO','RECHAZADO','CANCELADO']),recuperacion_pendiente:z.boolean(),intervencion:z.enum(['ORIGEN','DESTINO']),usuario_original_id:id,sustituto_id:id,participante_original:z.string(),sustituto:z.string(),autorizado_por:z.string(),oficina:z.string(),oficina_intervencion_id:id,motivo:z.string(),fecha_autorizacion:fecha,fecha_fin:fecha.nullable(),motivo_fin:z.string().nullable(),operacion_real:z.string().nullable(),ejecutante_real:z.string().nullable()});
export const sustituciones=(token:string,p:number)=>apiRequest(`/api/continuidad/sustituciones?pagina=${p}`,z.object({sustituciones:z.array(sustitucion),...pagina,puede_autorizar:z.boolean(),actor_id:id}),{},token);
export type Relevo=z.infer<typeof relevo>;export type Sustitucion=z.infer<typeof sustitucion>;
/** Cada acción tiene una URL propia y confirmación explícita; nunca reintenta escrituras. */
export const enviar=(token:string,ruta:string,body:unknown)=>apiRequest('/api/continuidad/'+ruta,z.object({relevo:relevo.optional(),sustitucion:sustitucion.optional(),documento_id:id.optional(),relevo_id:id.optional()}),{method:'POST',body:JSON.stringify(body)},token);
