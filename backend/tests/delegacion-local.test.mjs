import assert from 'node:assert/strict';
import {test} from 'node:test';
import {app} from '../dist/app.js';
import {pool} from '../dist/config/database.js';
import {generarToken} from '../dist/shared/security/jwt.js';

test('Delegación local: variantes HTTP y PostgreSQL, sin alterar otros registros',async t=>{
 const identidad=(await pool.query("SELECT current_database() base,(SELECT oid::text FROM pg_database WHERE datname=current_database()) oid,inet_server_addr()::text host")).rows[0];
 assert.equal(identidad.base,'sistema_web_documental_final');assert.equal(identidad.oid,'98367');assert.ok(['::1/128','127.0.0.1/32'].includes(identidad.host));
 const director=(await pool.query('SELECT id::text,version_autenticacion FROM usuarios WHERE rol_id=3 AND activo ORDER BY id LIMIT 1')).rows[0];
 const cuentas=(await pool.query('SELECT id::text,oficina_id::text,version_autenticacion,nombre_usuario FROM usuarios WHERE activo ORDER BY id')).rows;
 const oficinista=cuentas.find(u=>u.nombre_usuario==='oficinista');
 const conOficina=cuentas.find(u=>u.oficina_id&&u.id!==director.id);assert.ok(oficinista&&conOficina);
 const previo=(await pool.query('SELECT * FROM documentos WHERE id=3')).rows[0];assert.ok(previo.asunto.startsWith('[PRUEBA LOCAL'));assert.equal(String(previo.registrado_por),director.id);assert.equal(previo.situacion,'PENDIENTE_DIRECCION');
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api';
 async function pedir(ruta,body,actor=director){const r=await fetch(base+ruta,{headers:{Authorization:'Bearer '+generarToken(actor.id,actor.version_autenticacion),'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
 async function revertir(fn){
  // Todo el ciclo HTTP de esta variante ve la misma transacción real; no se
  // simulan servicios, autorización, SQL ni triggers. Cada operación usa savepoint.
  const original=pool.connect.bind(pool),c=await original();await c.query('BEGIN');
  const proxy={query:(sql,...args)=>c.query(sql==='BEGIN'?'SAVEPOINT variante':sql==='COMMIT'?'RELEASE SAVEPOINT variante':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT variante':sql,...args),release:()=>{}};
  pool.connect=callback=>typeof callback==='function'?original(callback):Promise.resolve(proxy);
  try{await fn(c);}finally{pool.connect=original;await c.query('ROLLBACK');c.release();}
  assert.deepEqual((await pool.query('SELECT * FROM documentos WHERE id=3')).rows[0],previo);
 }
 try{
  for(const [caso,destino] of [
   ['usuario sin oficina',{usuario_id:oficinista.id,oficina_id:null,nombre:null}],
   ['oficina y usuario compatible',{usuario_id:conOficina.id,oficina_id:conOficina.oficina_id,nombre:null}],
   ['nombre manual',{usuario_id:null,oficina_id:null,nombre:'Persona manual — prueba local'}]
  ])await t.test(caso,()=>revertir(async c=>{
   const anterior=(await c.query('SELECT count(*)::int n FROM auditoria_documental WHERE documento_id=3')).rows[0].n;
   const body={revision:String(previo.revision),observaciones:null,...destino};const r=await pedir('/documentos/3/delegar',body);assert.equal(r.status,200,JSON.stringify(r.body));
   assert.equal(r.body.documento.situacion,'DELEGADO');assert.equal(r.body.documento.registrado_por,director.id);assert.equal(r.body.documento.codigo_visible,previo.codigo_visible);
   const evento=(await c.query('SELECT * FROM delegaciones_documento WHERE documento_id=3')).rows;assert.equal(evento.length,1);assert.equal(evento[0].usuario_indicado_id?.toString()??null,destino.usuario_id);
   const h=await pedir('/documentos/3/historial');assert.equal(h.status,200);assert.equal(h.body.historial.length,anterior+1);assert.equal(new Set(h.body.historial.map(e=>e.id)).size,h.body.historial.length);assert.equal(h.body.historial.filter(e=>e.accion==='DELEGACION').length,1);
   assert.equal((await pedir('/documentos/3/delegar',body)).status,409);
  }));
  await t.test('incompatibilidad, destino vacío y lectura no autorizada mantienen errores reales',()=>revertir(async()=>{
   const revision=String(previo.revision),otra=cuentas.find(u=>u.oficina_id&&u.oficina_id!==conOficina.oficina_id);assert.ok(otra);
   assert.equal((await pedir('/documentos/3/delegar',{revision,usuario_id:conOficina.id,oficina_id:otra.oficina_id})).status,400);
   assert.equal((await pedir('/documentos/3/delegar',{revision})).status,400);
   assert.equal((await pedir('/documentos/3/delegar',{revision,nombre:'Prueba'},oficinista)).status,404);
  }));
  await t.test('documento 4: una delegación persistida, historial íntegro y repetición rechazada',async()=>{
   const d=await pedir('/documentos/4');assert.equal(d.status,200);assert.equal(d.body.documento.situacion,'DELEGADO');
   const filas=(await pool.query('SELECT * FROM delegaciones_documento WHERE documento_id=4')).rows;assert.equal(filas.length,1);assert.equal(String(filas[0].usuario_indicado_id),oficinista.id);
   const h=await pedir('/documentos/4/historial');const sql=(await pool.query('SELECT id::text FROM auditoria_documental WHERE documento_id=4 ORDER BY fecha,id')).rows;
   assert.deepEqual(h.body.historial.map(e=>e.id),sql.map(e=>e.id));assert.equal(h.body.historial.filter(e=>e.accion==='DELEGACION').length,1);
   assert.equal((await pedir('/documentos/4/delegar',{revision:'1',usuario_id:oficinista.id})).status,409);
  });
 }finally{await new Promise(r=>server.close(r));await pool.end();}
});
