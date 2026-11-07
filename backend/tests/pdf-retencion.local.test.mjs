import './helpers/exigir-aislamiento.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,unlink,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {pool} from '../dist/config/database.js';
import {verificarEntornoPrueba,leerFixtures} from './helpers/entorno-prueba.mjs';
import * as docs from '../dist/modules/documentos/documentos.operaciones.js';
import {pdfDocumental} from '../dist/modules/documentos-pdf/pdf.documental.js';
import {limpiarRetencionesPdf} from '../dist/modules/documentos-pdf/pdf.retencion.js';

test('Retención PDF: 14 días, permisos, fallos de almacenamiento/commit, reintento y conservación',async()=>{
 await verificarEntornoPrueba(pool);const f=leerFixtures(),u=f.cuentas.usuario;
 const dir=await mkdtemp(path.join(tmpdir(),'retencion-pdf-'));const p=await PDFDocument.create();p.addPage();const bytes=await p.save();
 let llamadas=0,fallar=false;const objeto=path.join(dir,'sintetico.pdf');await writeFile(objeto,bytes);
 const storage={subir:async()=> 'https://storage.invalid',validarYCopiar:async()=>{},abrir:async()=> 'https://storage.invalid/pdf',eliminar:async()=>{llamadas++;if(fallar)throw Error('Fallo simulado');try{await unlink(objeto);}catch(e){if(e.code!=='ENOENT')throw e;}await assert.rejects(access(objeto));}};
 const servicio=pdfDocumental(()=>storage);
 async function consulta(){return (await pool.query('SELECT * FROM pdf_retenciones_anulacion WHERE documento_id=$1',[d.id])).rows[0];}
 let d;
 try{
  d=(await docs.registrar(u.id,docs.alta.parse({tipo_id:f.tipos.usuario,clasificacion:'RECIBIDO',asunto:'Retención sintética'}))).documento;
  const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('app.actor_id',$1,true)",[u.id]);await c.query('INSERT INTO documentos_pdf(documento_id,revision,clave_r2,nombre,tamano_bytes,actualizado_por) VALUES($1,$2,$3,$4,$5,$6)',[d.id,randomUUID(),'fixture/retencion/'+randomUUID(),'sintetico.pdf',bytes.length,u.id]);await c.query('COMMIT');}finally{c.release();}
  const sinPdf=(await docs.registrar(u.id,docs.alta.parse({tipo_id:f.tipos.usuario,clasificacion:'RECIBIDO',asunto:'Sin PDF sintético'}))).documento;await docs.anular(u.id,sinPdf.id,{revision:sinPdf.revision,motivo:'Sin PDF'});assert.equal((await pool.query('SELECT 1 FROM pdf_retenciones_anulacion WHERE documento_id=$1',[sinPdf.id])).rowCount,0);
  const historiaAntes=(await docs.historial(u.id,d.id)).historial.length;
  await docs.anular(u.id,d.id,{revision:d.revision,motivo:'Anulación sintética para retención'});
  const r=await consulta();assert.ok(r);
  const protegido=await pool.connect();try{await protegido.query('BEGIN');await protegido.query('CREATE ROLE retencion_app_prueba NOLOGIN');await protegido.query('GRANT USAGE ON SCHEMA public TO retencion_app_prueba');await protegido.query('GRANT SELECT,DELETE ON documentos_pdf TO retencion_app_prueba');await protegido.query('GRANT SELECT ON documentos,usuarios,ambitos_registro,pdf_retenciones_anulacion TO retencion_app_prueba');await protegido.query('SET LOCAL ROLE retencion_app_prueba');await protegido.query("SELECT set_config('app.finalizar_retencion','on',true)");await assert.rejects(protegido.query('DELETE FROM documentos_pdf WHERE documento_id=$1',[d.id]));}finally{await protegido.query('ROLLBACK');protegido.release();}
  assert.equal(r.vence_en-r.anulado_en,14*24*60*60*1000);
  assert.equal((await pool.query("SELECT fecha FROM auditoria_documental WHERE documento_id=$1 AND accion='ANULACION'",[d.id])).rows[0].fecha.getTime(),r.anulado_en.getTime());
  assert.ok((await servicio.consultar(f.cuentas.superadmin.id,d.id)).archivo);assert.ok((await servicio.abrir(f.cuentas.superadmin.id,d.id,false)).url);
  for(const key of ['admin','director','secretaria','usuario']){await assert.rejects(servicio.consultar(f.cuentas[key].id,d.id),e=>e.status===404);await assert.rejects(servicio.abrir(f.cuentas[key].id,d.id,false),e=>e.status===404);}
  await pool.query('UPDATE usuarios SET activo=false WHERE id=$1',[u.id]);
  assert.deepEqual(await limpiarRetencionesPdf(()=>storage,20,d.id),{eliminados:0,pendientes:0});assert.equal(llamadas,0);await access(objeto);
  await assert.rejects(pool.query('SELECT finalizar_retencion_pdf($1,$2)',[d.id,r.revision]));
  // Solo en cluster efímero verificado: se mueve la fecha sintética para ensayar el límite temporal.
  await pool.query("UPDATE pdf_retenciones_anulacion SET anulado_en=clock_timestamp()-interval '14 days'+interval '1 hour' WHERE documento_id=$1",[d.id]);
  await limpiarRetencionesPdf(()=>storage,20,d.id);assert.equal(llamadas,0);
  await pool.query("UPDATE pdf_retenciones_anulacion SET anulado_en=clock_timestamp()-interval '14 days'-interval '1 second' WHERE documento_id=$1",[d.id]);
  const bloqueo=await pool.connect();try{await bloqueo.query('BEGIN');await bloqueo.query('SELECT id FROM documentos WHERE id=$1 FOR UPDATE',[d.id]);assert.deepEqual(await limpiarRetencionesPdf(()=>storage,20,d.id),{eliminados:0,pendientes:0});}finally{await bloqueo.query('ROLLBACK');bloqueo.release();}
  fallar=true;assert.deepEqual(await limpiarRetencionesPdf(()=>storage,20,d.id),{eliminados:0,pendientes:1});assert.equal((await consulta()).eliminado_en,null);assert.equal((await consulta()).intentos,1);await access(objeto);assert.ok((await servicio.consultar(f.cuentas.superadmin.id,d.id)).archivo);
  await limpiarRetencionesPdf(()=>storage,20,d.id);assert.equal(llamadas,1);
  await pool.query('UPDATE pdf_retenciones_anulacion SET reintentar_desde=clock_timestamp() WHERE documento_id=$1',[d.id]);
  // Simular fallo SQL después de borrar R2: rollback mantiene vínculo; próximo DELETE de objeto ausente es seguro.
  fallar=false;const original=pool.connect.bind(pool);pool.connect=async()=>{const c=await original();return {release:()=>c.release(),query:(s,...v)=>s.startsWith('SELECT finalizar_retencion_pdf')?Promise.reject(Error('SQL simulado después de R2')):c.query(s,...v)};};
  try{await assert.rejects(limpiarRetencionesPdf(()=>storage,20,d.id));}finally{pool.connect=original;}
  await assert.rejects(access(objeto));assert.equal((await consulta()).eliminado_en,null);assert.ok((await servicio.consultar(f.cuentas.superadmin.id,d.id)).archivo);
  await pool.query('CREATE ROLE retencion_finalizador_prueba NOLOGIN');await pool.query('GRANT USAGE ON SCHEMA public TO retencion_finalizador_prueba');await pool.query('GRANT EXECUTE ON FUNCTION finalizar_retencion_pdf(bigint,uuid) TO retencion_finalizador_prueba');
  pool.connect=async()=>{const c=await original();return {release:()=>c.release(),query:async(s,...v)=>{if(s.startsWith('SELECT finalizar_retencion_pdf'))await c.query('SET LOCAL ROLE retencion_finalizador_prueba');return c.query(s,...v);}};};
  try{assert.deepEqual(await limpiarRetencionesPdf(()=>storage,20,d.id),{eliminados:1,pendientes:0});}finally{pool.connect=original;}
  assert.ok((await consulta()).eliminado_en);assert.equal((await servicio.consultar(f.cuentas.superadmin.id,d.id)).archivo,null);await assert.rejects(servicio.abrir(f.cuentas.superadmin.id,d.id,false),e=>e.status===404);
  assert.equal((await pool.query('SELECT situacion FROM documentos WHERE id=$1',[d.id])).rows[0].situacion,'ANULADO');assert.ok((await docs.historial(f.cuentas.superadmin.id,d.id)).historial.length>=historiaAntes+1);
  const auditoria=await docs.auditoria(f.cuentas.superadmin.id,d.id);assert.ok(auditoria.eventos.some(x=>x.accion==='PDF_RETENCION_14_DIAS_ELIMINADA'&&x.motivo.includes('14 días')));
  const eventos=(await pool.query("SELECT accion FROM pdf_eventos WHERE documento_id=$1 AND accion LIKE 'RETENCION_%'",[d.id])).rows;assert.equal(eventos.filter(x=>x.accion==='RETENCION_14_DIAS_ELIMINADA').length,1);
  assert.deepEqual(await limpiarRetencionesPdf(()=>storage,20,d.id),{eliminados:0,pendientes:0});
 }finally{await pool.query('UPDATE usuarios SET activo=true WHERE id=$1',[u.id]);await rm(dir,{recursive:true,force:true});await pool.end();}
});
