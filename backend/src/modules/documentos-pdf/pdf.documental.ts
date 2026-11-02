import {randomUUID} from 'node:crypto';
import type {z} from 'zod';
import {pool} from '../../config/database.js';
import {operacion,documento,permisos} from '../../shared/documental/nucleo.js';
import {HttpError} from '../../shared/http/HttpError.js';
import {crearAlmacenR2,prefijoPdf,type AlmacenPdf} from './pdf.storage.js';
import type {iniciarSchema} from './pdf.schema.js';
export function pdfDocumental(almacen:()=>AlmacenPdf=crearAlmacenR2){
 async function consultar(actor:string,id:string){return operacion(actor,'Consulta PDF',async(c,a)=>{const d=await documento(c,a,id);const p=(await c.query('SELECT revision,nombre,tamano_bytes,actualizado_en FROM documentos_pdf WHERE documento_id=$1',[id])).rows[0]??null;return {archivo:p,modificar:permisos(a,d).pdf,limpieza_pendiente:(await c.query('SELECT count(*)::int cantidad FROM pdf_objetos_pendientes o WHERE documento_id=$1 AND eliminado_en IS NULL AND (intentos>0 OR limpiar_desde<=clock_timestamp()) AND NOT EXISTS(SELECT 1 FROM documentos_pdf p WHERE p.clave_r2=o.clave_r2)',[id])).rows[0].cantidad};});}
 async function iniciar(actor:string,id:string,v:z.infer<typeof iniciarSchema>){return operacion(actor,'Preparar PDF',async(c,a)=>{const d=await documento(c,a,id,true);if(!permisos(a,d).pdf)throw new HttpError(403,'Gestión PDF no autorizada');
 const p=(await c.query('SELECT revision FROM documentos_pdf WHERE documento_id=$1',[id])).rows[0];if((p?.revision??null)!==v.revision)throw new HttpError(409,'El PDF cambió');
 if(Number((await c.query('SELECT count(*) n FROM pdf_cargas WHERE actor_id=$1 AND confirmada_en IS NULL AND vence_en>clock_timestamp()',[a.id])).rows[0].n)>=3)throw new HttpError(429,'Hay cargas pendientes');
 const storage=almacen(),carga=randomUUID(),temporal='tmp/'+prefijoPdf()+randomUUID(),definitiva=prefijoPdf()+'pdf/'+randomUUID(),vence=new Date(Date.now()+600000);
 const url=await storage.subir(temporal,v.tamano);
 await c.query('INSERT INTO pdf_cargas(id,documento_id,actor_id,clave_temporal,clave_definitiva,nombre,tamano_bytes,vence_en,revision_esperada) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[carga,id,a.id,temporal,definitiva,v.nombre,v.tamano,vence,v.revision]);
 for(const clave of [temporal,definitiva])await c.query('INSERT INTO pdf_objetos_pendientes(clave_r2,documento_id,limpiar_desde) VALUES($1,$2,$3)',[clave,id,vence]);return {carga,url,headers:{'Content-Type':'application/pdf','If-None-Match':'*'}};
 });}
 async function confirmar(actor:string,id:string,carga:string){await operacion(actor,'Confirmar PDF',async(c,a)=>{const d=await documento(c,a,id,true);if(!permisos(a,d).pdf)throw new HttpError(403,'Gestión PDF no autorizada');
 const v=(await c.query('SELECT * FROM pdf_cargas WHERE id=$1 AND documento_id=$2 AND actor_id=$3 FOR UPDATE',[carga,id,a.id])).rows[0];if(!v)throw new HttpError(404,'Carga inexistente');const p=(await c.query('SELECT revision FROM documentos_pdf WHERE documento_id=$1',[id])).rows[0];
 if(v.confirmada_en&&p?.revision===carga)return;
 if(v.confirmada_en||new Date(v.vence_en).getTime()<=Date.now()||(p?.revision??null)!==v.revision_esperada)throw new HttpError(409,'Carga vencida o revisión obsoleta');
 await c.query('SELECT clave_r2 FROM pdf_objetos_pendientes WHERE clave_r2 IN ($1,$2) ORDER BY clave_r2 FOR UPDATE',[v.clave_temporal,v.clave_definitiva]);
 await almacen().validarYCopiar(v.clave_temporal,v.clave_definitiva,v.tamano_bytes);
 await c.query(`INSERT INTO documentos_pdf(documento_id,revision,clave_r2,nombre,tamano_bytes,actualizado_por) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(documento_id) DO UPDATE SET revision=EXCLUDED.revision,clave_r2=EXCLUDED.clave_r2,nombre=EXCLUDED.nombre,tamano_bytes=EXCLUDED.tamano_bytes,actualizado_por=EXCLUDED.actualizado_por,actualizado_en=clock_timestamp()`,[id,carga,v.clave_definitiva,v.nombre,v.tamano_bytes,a.id]);
 await c.query('UPDATE pdf_cargas SET confirmada_en=clock_timestamp() WHERE id=$1',[carga]);await c.query('UPDATE pdf_objetos_pendientes SET limpiar_desde=clock_timestamp() WHERE clave_r2=$1',[v.clave_temporal]);
 });await limpiar(20,id).catch(()=>{});return consultar(actor,id);}
 async function eliminar(actor:string,id:string,revision:string){await operacion(actor,'Eliminar PDF',async(c,a)=>{const d=await documento(c,a,id,true);if(!permisos(a,d).pdf)throw new HttpError(403,'Gestión PDF no autorizada');const r=await c.query('DELETE FROM documentos_pdf WHERE documento_id=$1 AND revision=$2',[id,revision]);if(!r.rowCount)throw new HttpError(409,'El PDF cambió');});await limpiar(20,id).catch(()=>{});return consultar(actor,id);}
 async function abrir(actor:string,id:string,descargar:boolean){return operacion(actor,'Abrir PDF',async(c,a)=>{await documento(c,a,id);const p=(await c.query('SELECT clave_r2,nombre FROM documentos_pdf WHERE documento_id=$1',[id])).rows[0];if(!p)throw new HttpError(404,'Sin PDF adjunto');return {url:await almacen().abrir(p.clave_r2,p.nombre,descargar),vence_en:60};});}
 async function limpiar(limite=20,id?:string){const c=await pool.connect();let eliminados=0,pendientes=0;try{await c.query('BEGIN');
 const candidatos=(await c.query('SELECT DISTINCT documento_id::text FROM pdf_objetos_pendientes WHERE eliminado_en IS NULL AND limpiar_desde<=clock_timestamp() AND ($1::bigint IS NULL OR documento_id=$1) LIMIT $2',[id??null,Math.min(limite,100)])).rows;
 for(const doc of candidatos){if(!(await c.query('SELECT id FROM documentos WHERE id=$1 FOR UPDATE SKIP LOCKED',[doc.documento_id])).rowCount)continue;
 const objetos=(await c.query(`SELECT o.clave_r2 FROM pdf_objetos_pendientes o WHERE o.documento_id=$1 AND o.eliminado_en IS NULL AND o.limpiar_desde<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM documentos_pdf p WHERE p.clave_r2=o.clave_r2) ORDER BY o.clave_r2 LIMIT $2 FOR UPDATE OF o SKIP LOCKED`,[doc.documento_id,limite])).rows;
 for(const o of objetos){let accion='LIMPIEZA_COMPLETADA';try{await almacen().eliminar(o.clave_r2);await c.query('UPDATE pdf_objetos_pendientes SET eliminado_en=clock_timestamp(),intentos=intentos+1 WHERE clave_r2=$1',[o.clave_r2]);eliminados++;}catch{accion='LIMPIEZA_PENDIENTE';await c.query("UPDATE pdf_objetos_pendientes SET intentos=intentos+1,limpiar_desde=clock_timestamp()+interval '1 minute' WHERE clave_r2=$1",[o.clave_r2]);pendientes++;}await c.query('INSERT INTO pdf_eventos(documento_id,accion) VALUES($1,$2)',[doc.documento_id,accion]);}}
 await c.query('COMMIT');return {eliminados,pendientes};}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 return {consultar,iniciar,confirmar,eliminar,abrir,limpiar};
}
export const pdfActual=pdfDocumental();
