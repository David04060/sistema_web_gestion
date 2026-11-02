import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,writeFile} from 'node:fs/promises';
import {app} from '../dist/app.js';
import {pool} from '../dist/config/database.js';
import {generarToken} from '../dist/shared/security/jwt.js';

test('Correlativos concurrentes y corrección obsoleta sobre registros ficticios identificados',async()=>{
 const identidad=(await pool.query('SELECT current_database() base,inet_server_addr()::text host')).rows[0];assert.equal(identidad.base,'sistema_web_documental_final');assert.ok(['::1/128','127.0.0.1/32'].includes(identidad.host));
 const archivo='.private/revision-integral/r2-real-manifiesto.json',m=JSON.parse(await readFile(archivo,'utf8'));assert.match(m.marca,/^\[PRUEBA REVISIÓN INTEGRAL /);const tipo=m.tipos.find(t=>t.actor==='4').id;
 const a=(await pool.query('SELECT id::text,version_autenticacion FROM usuarios WHERE id=4 AND rol_id=4 AND activo')).rows[0];assert.ok(a);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/documentos';
 async function pedir(method,ruta,body){const r=await fetch(base+ruta,{method,headers:{Authorization:'Bearer '+generarToken(a.id,a.version_autenticacion),'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
 try{
  const largos='Asunto extenso de prueba para comprobar el ajuste natural del texto en escritorio, tableta y móvil, sin dividir cada palabra en letras. '.repeat(10);
  const respuestas=await Promise.all(['A','B'].map((n,i)=>pedir('POST','',{tipo_id:tipo,clasificacion:i?'EMITIDO':'RECIBIDO',asunto:m.marca+' Correlativo concurrente '+n+(i?' '+largos:'')})));
  for(const r of respuestas){assert.equal(r.status,201,JSON.stringify(r.body));const d=r.body.documento;m.documentos.push({id:d.id,codigo:d.codigo_visible,actor:a.id,asunto:d.asunto});}await writeFile(archivo,JSON.stringify(m,null,2));
  const docs=respuestas.map(r=>r.body.documento);assert.notEqual(docs[0].codigo_visible,docs[1].codigo_visible);assert.equal(Math.abs(Number(docs[0].correlativo)-Number(docs[1].correlativo)),1);
  const d=docs[0];const correcciones=await Promise.all(['Primera','Segunda'].map(n=>pedir('PUT','/'+d.id,{revision:d.revision,motivo:'PRUEBA REVISIÓN concurrencia',asunto:m.marca+' '+n+' corrección concurrente'})));assert.deepEqual(correcciones.map(r=>r.status).sort(),[200,409]);
  const h=(await pool.query("SELECT accion FROM auditoria_documental WHERE documento_id=$1 AND accion='CORRECCION'",[d.id])).rows;assert.equal(h.length,1);
 }finally{await new Promise(r=>server.close(r));await pool.end();}
});
