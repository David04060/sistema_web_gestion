import './helpers/exigir-aislamiento.mjs';
import {verificarEntornoPrueba,leerFixtures} from './helpers/entorno-prueba.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {app} from '../dist/app.js';
import {pool} from '../dist/config/database.js';
import {generarToken} from '../dist/shared/security/jwt.js';

test('Delegación aislada: variantes HTTP, historial y conservación mediante rollback',async t=>{
 await verificarEntornoPrueba(pool);
 const f=leerFixtures(),director=f.cuentas.director,sinOficina=f.cuentas.sinOficina,conOficina=f.cuentas.usuario;
 const pendienteId=f.documentos.pendiente.id,delegadoId=f.documentos.delegado.id;
 const previo=(await pool.query('SELECT * FROM documentos WHERE id=$1',[pendienteId])).rows[0];
 assert.equal(previo.asunto,f.documentos.pendiente.asunto);assert.equal(previo.codigo_visible,f.documentos.pendiente.codigo_visible);
 assert.equal(String(previo.registrado_por),director.id);assert.equal(previo.situacion,'PENDIENTE_DIRECCION');
 assert.equal(sinOficina.oficina_id,null);assert.ok(conOficina.oficina_id);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port+'/api';
 async function pedir(ruta,body,actor=director){
  const r=await fetch(base+ruta,{headers:{Authorization:'Bearer '+generarToken(actor.id,actor.version_autenticacion),'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
  return {status:r.status,body:await r.json()};
 }
 async function revertir(fn){
  const original=pool.connect.bind(pool),c=await original();await verificarEntornoPrueba(c);await c.query('BEGIN');
  const proxy={query:(sql,...args)=>c.query(sql==='BEGIN'?'SAVEPOINT variante':sql==='COMMIT'?'RELEASE SAVEPOINT variante':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT variante':sql,...args),release:()=>{}};
  pool.connect=callback=>typeof callback==='function'?original(callback):Promise.resolve(proxy);
  try{await fn(c);}finally{pool.connect=original;await c.query('ROLLBACK');c.release();}
  assert.deepEqual((await pool.query('SELECT * FROM documentos WHERE id=$1',[pendienteId])).rows[0],previo);
 }
 try{
  for(const [caso,destino]of [
   ['usuario sin oficina',{usuario_id:sinOficina.id,oficina_id:null,nombre:null}],
   ['oficina y usuario compatible',{usuario_id:conOficina.id,oficina_id:conOficina.oficina_id,nombre:null}],
   ['nombre manual',{usuario_id:null,oficina_id:null,nombre:'Persona sintética sin cuenta'}]
  ])await t.test(caso,()=>revertir(async c=>{
   const anterior=(await c.query('SELECT count(*)::int n FROM auditoria_documental WHERE documento_id=$1',[pendienteId])).rows[0].n;
   const body={revision:String(previo.revision),observaciones:null,...destino};
   const r=await pedir('/documentos/'+pendienteId+'/delegar',body);assert.equal(r.status,200);
   assert.equal(r.body.documento.situacion,'DELEGADO');assert.equal(r.body.documento.registrado_por,director.id);assert.equal(r.body.documento.codigo_visible,previo.codigo_visible);
   const eventos=(await c.query('SELECT * FROM delegaciones_documento WHERE documento_id=$1',[pendienteId])).rows;
   assert.equal(eventos.length,1);assert.equal(eventos[0].usuario_indicado_id?.toString()??null,destino.usuario_id);
   const h=await pedir('/documentos/'+pendienteId+'/historial');assert.equal(h.status,200);assert.equal(h.body.historial.length,anterior+1);
   assert.equal(new Set(h.body.historial.map(e=>e.id)).size,h.body.historial.length);assert.equal(h.body.historial.filter(e=>e.accion==='DELEGACION').length,1);
   assert.equal((await pedir('/documentos/'+pendienteId+'/delegar',body)).status,409);
  }));
  await t.test('Incompatibilidad, destino vacío y lectura no autorizada conservan sus errores',()=>revertir(async()=>{
   const revision=String(previo.revision);
   assert.equal((await pedir('/documentos/'+pendienteId+'/delegar',{revision,usuario_id:conOficina.id,oficina_id:f.oficinas['Dirección']})).status,400);
   assert.equal((await pedir('/documentos/'+pendienteId+'/delegar',{revision})).status,400);
   assert.equal((await pedir('/documentos/'+pendienteId+'/delegar',{revision,nombre:'Prueba'},sinOficina)).status,404);
  }));
  await t.test('Documento delegado del fixture: una delegación, historial íntegro y repetición rechazada',async()=>{
   const d=await pedir('/documentos/'+delegadoId);assert.equal(d.status,200);assert.equal(d.body.documento.situacion,'DELEGADO');
   const filas=(await pool.query('SELECT * FROM delegaciones_documento WHERE documento_id=$1',[delegadoId])).rows;
   assert.equal(filas.length,1);assert.equal(String(filas[0].usuario_indicado_id),sinOficina.id);
   const h=await pedir('/documentos/'+delegadoId+'/historial'),sql=(await pool.query('SELECT id::text FROM auditoria_documental WHERE documento_id=$1 ORDER BY fecha,id',[delegadoId])).rows;
   assert.deepEqual(h.body.historial.map(e=>e.id),sql.map(e=>e.id));assert.equal(h.body.historial.filter(e=>e.accion==='DELEGACION').length,1);
   assert.equal((await pedir('/documentos/'+delegadoId+'/delegar',{revision:f.delegacion.revisionAnterior,usuario_id:sinOficina.id})).status,409);
   assert.equal((await pedir('/documentos/'+delegadoId+'/delegar',{revision:d.body.documento.revision,usuario_id:sinOficina.id})).status,403);
  });
 }finally{await new Promise(r=>server.close(r));await pool.end();}
});
