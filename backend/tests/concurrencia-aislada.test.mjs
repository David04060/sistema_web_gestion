import './helpers/exigir-aislamiento.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {leerFixtures,verificarEntornoPrueba} from './helpers/entorno-prueba.mjs';
import {app} from '../dist/app.js';
import {pool} from '../dist/config/database.js';
import {generarToken} from '../dist/shared/security/jwt.js';

test('Correlativos y revisión concurrentes con actores y documentos propios del fixture',async()=>{
 await verificarEntornoPrueba(pool);
 const f=leerFixtures(),actor=f.cuentas.secretaria;
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port+'/api/documentos';
 async function pedir(method,ruta,body){const r=await fetch(base+ruta,{method,headers:{Authorization:'Bearer '+generarToken(actor.id,actor.version_autenticacion),'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
 try{
  const respuestas=await Promise.all(['A','B'].map(n=>pedir('POST','',{tipo_id:f.tipos.director,clasificacion:'RECIBIDO',asunto:'Fixture concurrente '+n})));
  for(const r of respuestas)assert.equal(r.status,201);
  const docs=respuestas.map(r=>r.body.documento);assert.notEqual(docs[0].codigo_visible,docs[1].codigo_visible);
  assert.equal(Math.abs(Number(docs[0].correlativo)-Number(docs[1].correlativo)),1);
  const d=docs[0],cambios=await Promise.all(['Primera','Segunda'].map(n=>pedir('PUT','/'+d.id,{revision:d.revision,motivo:'Fixture concurrente',asunto:n})));
  assert.deepEqual(cambios.map(r=>r.status).sort(),[200,409]);
  assert.equal((await pool.query("SELECT count(*)::int n FROM auditoria_documental WHERE documento_id=$1 AND accion='CORRECCION'",[d.id])).rows[0].n,1);
 }finally{await new Promise(r=>server.close(r));await pool.end();}
});
