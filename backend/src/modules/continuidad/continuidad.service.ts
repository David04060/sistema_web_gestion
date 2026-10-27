import type { PoolClient } from 'pg';
import { env } from '../../config/env.js';
import { HttpError } from '../../shared/http/HttpError.js';
import { obtenerActor,transaccionDocumental,type ActorDocumental } from '../../shared/documental/transaccion.js';
import { consultar } from '../documentos/pertenencia.repository.js';
import * as documentos from '../documentos/documentos.repository.js';
import * as movimientos from '../movimientos/movimientos.repository.js';
import * as archivos from '../archivos/archivos.repository.js';
import * as r from './continuidad.repository.js';
import type {Pagina,Relevar,Aceptar,Designar,Ejecutar} from './continuidad.schema.js';
function capacidad(sustitucion=false){if(!(sustitucion?env.SUSTITUCIONES_HABILITADAS:env.RELEVOS_HABILITADOS))throw new HttpError(409,'La capacidad de continuidad no está habilitada');}
async function leer<T>(actorId:string,fn:(c:PoolClient,a:ActorDocumental)=>Promise<T>){const a=await obtenerActor(actorId);return consultar(a,async c=>fn(c!,await obtenerActor(actorId,c)));}
async function exigirRelevo(c:PoolClient,id:string){const row=await r.relevo(c,id);if(!row)throw new HttpError(404,'Relevo inexistente o no autorizado');return row;}
function direccion(a:ActorDocumental){if(a.rol!=='Director(a)')throw new HttpError(403,'La sustitución requiere autorización expresa de Dirección');}
export async function listar(actor:string,p:Pagina){capacidad();return leer(actor,async(c,a)=>({...await r.relevos(c,p),puede_formalizar:a.rol==='Administrador',puede_autorizar_sustitucion:a.rol==='Director(a)',actor_id:a.id}));}
export async function pendientes(actor:string,id:string,p:Pagina){capacidad();return leer(actor,async(c,a)=>{if(a.rol==='Administrador')throw new HttpError(403,'Administrar archivos no concede consulta documental');await exigirRelevo(c,id);return r.pendientes(c,id,p);});}
/** Cierra y abre períodos conjuntamente. No cambia custodia ni asigna documentos históricos. */
export async function formalizar(actorId:string,datos:Relevar){capacidad();return transaccionDocumental(actorId,datos.motivo,async(c,a)=>{
 if(a.rol!=='Administrador')throw new HttpError(403,'Solo Administración formaliza el responsable del archivo');
 if(!await archivos.bloquear(c,datos.archivo_id))throw new HttpError(404,'Archivo no encontrado');
 const archivo=await archivos.obtener(c,datos.archivo_id);if(!archivo)throw new HttpError(404,'Archivo no encontrado');
 if(archivo.asignacion_id!==datos.asignacion_saliente_id)throw new HttpError(409,'El responsable del archivo cambió; actualice la consulta antes de formalizar otro relevo');
 const {responsable}=await archivos.referencias(c,archivo.oficina_id,datos.responsable_entrante_id);
 if(!responsable?.activo||responsable.rol==='Administrador'||responsable.oficina_id!==archivo.oficina_id||datos.responsable_entrante_id===archivo.responsable_id)
 throw new HttpError(400,'Seleccione otro responsable activo de la misma oficina');
 if((responsable.rol==='Director(a)'&&archivo.oficina!=='Dirección')||(responsable.rol==='Secretaria de Dirección'&&archivo.oficina!=='Mesa de Partes'))throw new HttpError(400,'Rol incompatible con la oficina del archivo');
 await c.query("SELECT set_config('app.archivo_operacion','RELEVAR',true)");
 const fecha=(await c.query("SELECT to_jsonb(clock_timestamp())#>>'{}' fecha")).rows[0].fecha;
 await c.query('UPDATE archivos_asignaciones SET fecha_fin=$2,finalizado_por_id=$3,motivo_fin=$4 WHERE id=$1 AND fecha_fin IS NULL',[archivo.asignacion_id,fecha,a.id,datos.motivo]);
 const e=(await c.query(`INSERT INTO archivos_asignaciones(archivo_id,responsable_id,fecha_inicio,formalizado_por_id,motivo) VALUES($1,$2,$3,$4,$5) RETURNING id::text`,[archivo.id,datos.responsable_entrante_id,fecha,a.id,datos.motivo])).rows[0];
 const nuevo=(await c.query(`INSERT INTO archivos_relevos(archivo_id,asignacion_saliente_id,asignacion_entrante_id,formalizado_por_id,fecha_formalizacion,motivo,responsable_saliente_id,responsable_entrante_id)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id::text`,[archivo.id,archivo.asignacion_id,e.id,a.id,fecha,datos.motivo,archivo.responsable_id,datos.responsable_entrante_id])).rows[0];
 return {relevo:await exigirRelevo(c,nuevo.id)};
 });}
export async function aceptar(actorId:string,id:string){capacidad();return transaccionDocumental(actorId,'Aceptación personal del relevo de responsabilidad',async(c,a)=>{
 const x=await exigirRelevo(c,id);if(x.responsable_entrante_id!==a.id)throw new HttpError(403,'Solo el responsable entrante acepta el relevo');if(x.fecha_aceptacion)throw new HttpError(409,'El relevo ya fue aceptado');
 await c.query('UPDATE archivos_relevos SET aceptado_por_id=$2,fecha_aceptacion=clock_timestamp() WHERE id=$1',[id,a.id]);return {relevo:await exigirRelevo(c,id)};
 });}
/** Aceptación física individual. La continuidad de ubicación no altera la titularidad del estante. */
export async function aceptarOriginal(actorId:string,id:string,datos:Aceptar){capacidad();return transaccionDocumental(actorId,datos.motivo,async(c,a)=>{
 await documentos.bloquear(datos.documento_id,c);const x=await exigirRelevo(c,id);
 if(x.responsable_entrante_id!==a.id||!x.fecha_aceptacion)throw new HttpError(403,'Primero el responsable entrante debe aceptar personalmente el relevo');
 if((await c.query("SELECT 1 FROM relevos_documentos WHERE relevo_id=$1 AND documento_id=$2 AND hecho='ENTREGA'",[id,datos.documento_id])).rowCount)throw new HttpError(409,'El original ya fue aceptado');
 const d=await r.documento(c,datos.documento_id);
 if(!d||d.archivo_id!==x.archivo_id||d.responsable_actual_id!==x.responsable_saliente_id||d.oficina_responsable_id!==a.oficina_id)throw new HttpError(404,'Original no presentado a este relevo');
 if(!d.libre)throw new HttpError(409,'El original tiene circulación, recuperación o autorización pendiente');
 const ubicacion=datos.continuar_ubicacion?d.archivador_id:datos.archivador_id;
 await r.insertarEntrega(c,id,d.id,a.id,ubicacion,datos.motivo);
 await c.query('UPDATE documentos SET responsable_actual_id=$2,archivador_id=$3 WHERE id=$1',[d.id,a.id,ubicacion]);
 return {documento_id:d.id,relevo_id:id};
 });}
export async function sustituciones(actor:string,p:Pagina){capacidad(true);return leer(actor,async(c,a)=>{if(a.rol==='Administrador')throw new HttpError(403,'Administración no consulta intervenciones documentales');return {...await r.sustituciones(c,p),puede_autorizar:a.rol==='Director(a)',actor_id:a.id};});}
export async function designar(actorId:string,datos:Designar){capacidad(true);return transaccionDocumental(actorId,datos.motivo,async(c,a)=>{
 direccion(a);let m=await r.movimiento(c,datos.movimiento_id);if(!m)throw new HttpError(404,'Movimiento inexistente o no autorizado');
 await documentos.bloquear(m.documento_id,c);await movimientos.bloquear(m.id,c);m=await r.movimiento(c,m.id);
 if(!m||(datos.intervencion==='DESTINO'?m.estado!=='EN_TRASLADO':!(m.estado==='EN_TRASLADO'||(m.estado==='RECHAZADO'&&!m.devolucion_confirmada_por_id))))throw new HttpError(409,'La intervención ya no está pendiente');
 if((await c.query('SELECT 1 FROM movimientos_sustituciones WHERE movimiento_id=$1 AND intervencion=$2 AND fecha_fin IS NULL',[m.id,datos.intervencion])).rowCount)throw new HttpError(409,'Ya existe una designación vigente para esa intervención');
 const origen=datos.intervencion==='ORIGEN';const original=origen?m.usuario_origen_id:m.usuario_destino_id,oficina=origen?m.oficina_origen_id:m.oficina_destino_id;
 if(original===datos.sustituto_id)throw new HttpError(400,'Seleccione una persona distinta del participante original');
 const id=(await c.query(`INSERT INTO movimientos_sustituciones(relevo_id,movimiento_id,intervencion,usuario_original_id,sustituto_id,oficina_intervencion_id,autorizado_por_id,formalizado_por_id,fecha_autorizacion,motivo)
 VALUES($1,$2,$3,$4,$5,$6,$7,$7,clock_timestamp(),$8) RETURNING id::text`,[datos.relevo_id??null,m.id,datos.intervencion,original,datos.sustituto_id,oficina,a.id,datos.motivo])).rows[0];
 return {sustitucion:await r.sustitucion(c,id.id)};
 });}
export async function finalizar(actorId:string,id:string,motivo:string){capacidad(true);return transaccionDocumental(actorId,motivo,async(c,a)=>{direccion(a);const s=await r.sustitucion(c,id);if(!s)throw new HttpError(404,'Designación no encontrada');await documentos.bloquear(s.documento_id,c);if(s.fecha_fin)throw new HttpError(409,'La designación ya finalizó');await r.finalizar(c,id,a.id,motivo);return {sustitucion:await r.sustitucion(c,id)};});}
/** No suplanta al actor ni toca participantes históricos: SQL valida la designación y el hecho real. */
export async function ejecutar(actorId:string,id:string,datos:Ejecutar){capacidad(true);return transaccionDocumental(actorId,datos.motivo,async(c,a)=>{
 let s=await r.sustitucion(c,id);if(!s)throw new HttpError(404,'Designación no encontrada');await documentos.bloquear(s.documento_id,c);await movimientos.bloquear(s.movimiento_id,c);s=await r.sustitucion(c,id);
 if(!s||s.fecha_fin)throw new HttpError(409,'La designación ya no está vigente');
 if(s.sustituto_id!==a.id||s.oficina_intervencion_id!==a.oficina_id)throw new HttpError(403,'La intervención solo corresponde a la persona designada en esa oficina');
 const m=await r.movimiento(c,s.movimiento_id);if(!m)throw new HttpError(404,'Movimiento no disponible');
 const destino=datos.operacion==='RECIBIR'||datos.operacion==='RECHAZAR';
 if((destino?s.intervencion!=='DESTINO':s.intervencion!=='ORIGEN')||(datos.operacion==='RECUPERAR'?(m.estado!=='RECHAZADO'||m.devolucion_confirmada_por_id!==null):m.estado!=='EN_TRASLADO'))throw new HttpError(409,'Esa operación no corresponde a la intervención pendiente');
 await c.query("SELECT set_config('app.sustitucion_id',$1,true)",[id]);
 await c.query(`INSERT INTO sustituciones_actuaciones(sustitucion_id,actuado_por_id,operacion,fecha_actuacion,motivo) VALUES($1,$2,$3,clock_timestamp(),$4)`,[id,a.id,datos.operacion,datos.motivo]);
 if(datos.operacion==='RECIBIR'){await movimientos.recibir(m.id,a.id,c);await documentos.recibir(m.documento_id,a.id,m.oficina_destino_id,datos.archivador_id,c);}
 else if(datos.operacion==='RECHAZAR'){await movimientos.rechazar(m.id,a.id,datos.motivo,c);await documentos.rechazar(m.documento_id,c);}
 else {if(datos.operacion==='RECUPERAR')await movimientos.recuperar(m.id,a.id,c);else await movimientos.cancelar(m.id,a.id,datos.motivo,c);await documentos.recibir(m.documento_id,a.id,m.oficina_origen_id,datos.archivador_id,c);}
 await r.finalizar(c,id,a.id,'Intervención ejecutada: '+datos.motivo);
 return {sustitucion:await r.sustitucion(c,id)};
 });}
