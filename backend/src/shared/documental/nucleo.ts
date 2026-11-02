import type {PoolClient} from 'pg';
import {pool} from '../../config/database.js';
import {HttpError} from '../http/HttpError.js';
export interface Actor {id:string;rol_id:number;oficina_id:string|null;ambito_id:string|null;activo:boolean}
export async function actorActual(c:PoolClient,id:string):Promise<Actor>{
 const a=(await c.query<Actor>(`SELECT u.id::text,u.rol_id,u.oficina_id::text,m.ambito_id::text,u.activo FROM usuarios u LEFT JOIN miembros_ambito m ON m.usuario_id=u.id WHERE u.id=$1`,[id])).rows[0];
 if(!a?.activo)throw new HttpError(401,'Cuenta inactiva');return a;
}
/** Identidad revalidada y configuración exclusivamente transaccional de los triggers nuevos. */
export async function operacion<T>(id:string,motivo:string,fn:(c:PoolClient,a:Actor)=>Promise<T>):Promise<T>{
 const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtext('documental-configuracion'))");
 const a=await actorActual(c,id);await c.query("SELECT set_config('app.actor_id',$1,true),set_config('app.motivo',$2,true)",[a.id,motivo]);
 const r=await fn(c,a);await c.query('COMMIT');return r;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export function exigirAdministracion(a:Actor){if(![1,2].includes(a.rol_id))throw new HttpError(403,'Se requiere administración');}
export function exigirAmbito(a:Actor){if(!a.ambito_id||![3,4,5].includes(a.rol_id))throw new HttpError(403,'No tiene ámbito documental');return a.ambito_id;}
export const lecturaSQL=`($1::bigint IS NOT NULL AND ($2::smallint=1 OR (d.situacion<>'ANULADO' AND ($2::smallint IN (3,4) OR ($2::smallint=5 AND d.ambito_id=$3::bigint)))))`;
export interface Registro {id:string;ambito_id:string;registrado_por:string;situacion:string;revision:string;[k:string]:unknown}
export async function documento(c:PoolClient,a:Actor,id:string,bloquear=false):Promise<Registro>{
 if(bloquear)await c.query('SELECT id FROM documentos WHERE id=$1 FOR UPDATE',[id]);
 const d=(await c.query<Registro>(`SELECT d.*,d.id::text,d.ambito_id::text,d.tipo_id::text,d.registrado_por::text,d.revision::text,(SELECT concat_ws(' ',u.nombre,u.apellido) FROM usuarios u WHERE u.id=d.registrado_por) registrado_por_nombre FROM documentos d WHERE d.id=$1 AND ${lecturaSQL}`,[id,a.rol_id,a.ambito_id])).rows[0];
 if(!d)throw new HttpError(404,'Documento inexistente o no autorizado');return d;
}
export function permisos(a:Actor,d:Registro){const propio=d.registrado_por===a.id,compartido=a.ambito_id===d.ambito_id&&[3,4].includes(a.rol_id),vigente=d.situacion!=='ANULADO',antes=vigente&&d.situacion!=='DELEGADO';
 return {relacionar:vigente&&a.ambito_id===d.ambito_id&&[3,4,5].includes(a.rol_id),corregir:vigente&&propio&&(a.rol_id!==5||d.situacion!=='DELEGADO'),anular:antes&&(propio||compartido&&a.rol_id===3&&d.situacion==='PENDIENTE_DIRECCION'),
 delegar:vigente&&(a.rol_id===3&&compartido&&d.situacion==='PENDIENTE_DIRECCION'||propio&&a.rol_id===4&&d.situacion==='EN_MESA_DE_PARTES'||propio&&a.rol_id===5&&d.situacion==='PERSONAL'),
 ubicar:vigente&&a.oficina_id!==null&&(a.rol_id===3&&compartido&&d.situacion==='PENDIENTE_DIRECCION'||propio&&['PERSONAL','EN_MESA_DE_PARTES'].includes(d.situacion)),
 pdf:vigente&&(compartido||propio&&a.rol_id===5&&d.situacion!=='DELEGADO')};
}
export function exigirRevision(d:Registro,revision:string){if(d.revision!==revision)throw new HttpError(409,'El documento cambió; vuelva a consultar');}
export async function auditarConfiguracion(c:PoolClient,a:Actor,entidad:string,id:string,accion:string,antes:unknown,despues:unknown){await c.query("INSERT INTO auditoria_configuracion(actor_id,entidad,entidad_id,accion,anterior,posterior,motivo) VALUES($1,$2,$3,$4,$5,$6,nullif(current_setting('app.motivo',true),''))",[a.id,entidad,id,accion,JSON.stringify(antes),JSON.stringify(despues)]);}
