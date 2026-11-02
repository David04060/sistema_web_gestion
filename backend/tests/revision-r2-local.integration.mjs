// Ejecutar explícitamente: prueba real, crea registros locales identificados y objetos R2 aislados.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash,randomBytes} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {mkdir,writeFile} from 'node:fs/promises';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {app} from '../dist/app.js';
import {pool} from '../dist/config/database.js';
import {generarToken} from '../dist/shared/security/jwt.js';
import {pdfActual,pdfDocumental} from '../dist/modules/documentos-pdf/pdf.documental.js';
import {crearAlmacenR2,prefijoPdf} from '../dist/modules/documentos-pdf/pdf.storage.js';

test('Revisión real local: concurrencia, códigos entre ámbitos y R2 privado aislado',async t=>{
 const identidad=(await pool.query('SELECT current_database() base,inet_server_addr()::text host')).rows[0];assert.equal(identidad.base,'sistema_web_documental_final');assert.ok(['::1/128','127.0.0.1/32'].includes(identidad.host));
 assert.equal(prefijoPdf(),'qa/pdf-documental-nuevo/');
 const actores=(await pool.query('SELECT id::text,rol_id,version_autenticacion FROM usuarios WHERE activo ORDER BY id')).rows;const actor=rol=>actores.find(a=>a.rol_id===rol);const sec=actor(4),dir=actor(3),usr=actor(5),admin=actor(2);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api';
 const manifest={marca:'[PRUEBA REVISIÓN INTEGRAL '+randomBytes(3).toString('hex')+']',tipos:[],documentos:[],objetos:[],resultados:[]};
 await mkdir('.private/revision-integral',{recursive:true});
 async function guardar(){await writeFile('.private/revision-integral/r2-real-manifiesto.json',JSON.stringify(manifest,null,2));}
 async function pedir(a,ruta,method='GET',body){const r=await fetch(base+ruta,{method,headers:{Authorization:'Bearer '+generarToken(a.id,a.version_autenticacion),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
 async function ok(a,ruta,method='GET',body,status=200){const r=await pedir(a,ruta,method,body);assert.equal(r.status,status,JSON.stringify({ruta,...r}));return r.body;}
 async function doc(a,tipo,asunto){const d=(await ok(a,'/documentos','POST',{tipo_id:tipo,clasificacion:'RECIBIDO',asunto:manifest.marca+' '+asunto},201)).documento;manifest.documentos.push({id:d.id,codigo:d.codigo_visible,actor:a.id,asunto:d.asunto});await guardar();return d;}
 async function bytes(text){const p=await PDFDocument.create(),f=await p.embedFont(StandardFonts.Helvetica);p.addPage().drawText(text,{x:40,y:720,size:16,font:f});return Buffer.from(await p.save());}
 const hash=b=>createHash('sha256').update(b).digest('hex');
 const almacen=crearAlmacenR2();
 async function cargar(a,d,b,revision=null){const v=await ok(a,'/documentos/'+d.id+'/pdf/cargas','POST',{nombre:'revision-local.pdf',mime:'application/pdf',tamano:b.length,revision});const fila=(await pool.query('SELECT clave_temporal,clave_definitiva FROM pdf_cargas WHERE id=$1',[v.carga])).rows[0];assert.ok(fila.clave_temporal.startsWith('tmp/'+prefijoPdf()));manifest.objetos.push({documento:d.id,carga:v.carga,...fila});await guardar();const r=await fetch(v.url,{method:'PUT',headers:v.headers,body:b});assert.equal(r.status,200,'PUT R2: '+r.status);return v.carga;}
 async function ausente(clave){const url=await almacen.abrir(clave,'revision-local.pdf',false);const r=await fetch(url);await r.arrayBuffer();assert.equal(r.status,404,'El objeto de prueba aún existe o no se pudo verificar');}
 let principal,posterior,carrera,personal;
 try{
  let ts,tu;
  for(const a of [sec,usr]){const tipo=(await ok(a,'/tipos-documentales','POST',{nombre:manifest.marca+' tipos',prefijo:'RVINT'},201)).id;manifest.tipos.push({id:tipo,actor:a.id});if(a===sec)ts=tipo;else tu=tipo;await guardar();}
  principal=await doc(sec,ts,'PDF registro y sustitución');personal=await doc(usr,tu,'Código igual en ámbito personal');posterior=await doc(sec,ts,'Adjunto posterior');carrera=await doc(sec,ts,'Delegaciones concurrentes');
  await t.test('Código visible igual, navegación por ID y conteos combinados con fecha',async()=>{
   assert.equal(principal.codigo_visible,personal.codigo_visible);const fecha=(await pool.query("SELECT to_char(creado_en AT TIME ZONE 'America/Lima','YYYY-MM-DD') fecha FROM documentos WHERE id=$1",[principal.id])).rows[0].fecha;
   for(const a of [dir,sec]){const r=await ok(a,'/documentos?q='+principal.codigo_visible+'&fecha='+fecha+'&clasificacion=RECIBIDO&limite=1');assert.equal(r.total,2);const otra=await ok(a,'/documentos?q='+principal.codigo_visible+'&fecha='+fecha+'&clasificacion=RECIBIDO&limite=1&pagina=2');assert.equal(otra.total,2);assert.notEqual(r.documentos[0].id,otra.documentos[0].id);}
   assert.equal((await ok(usr,'/documentos?q='+principal.codigo_visible)).total,1);
  });
  await t.test('Concurrencia real de delegación: una confirmada, otra obsoleta, sin transferencia',async()=>{
   const r=await Promise.all([pedir(dir,'/documentos/'+carrera.id+'/delegar','POST',{revision:carrera.revision,usuario_id:usr.id}),pedir(dir,'/documentos/'+carrera.id+'/delegar','POST',{revision:carrera.revision,nombre:'Persona manual de prueba'})]);assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);
   const actual=(await ok(sec,'/documentos/'+carrera.id)).documento;assert.equal(actual.registrado_por,sec.id);assert.equal(actual.ambito_id,carrera.ambito_id);assert.equal((await pedir(usr,'/documentos/'+carrera.id)).status,404);
   assert.equal((await pool.query('SELECT count(*)::int n FROM delegaciones_documento WHERE documento_id=$1',[carrera.id])).rows[0].n,1);
  });
  await t.test('R2 real: carga, descarga SHA-256, reemplazo y eliminación física',async()=>{
   const b1=await bytes('PRUEBA LOCAL PDF UNO'),b2=await bytes('PRUEBA LOCAL PDF DOS');
   const c1=await cargar(sec,principal,b1);let estado=await ok(sec,'/documentos/'+principal.id+'/pdf/confirmar','POST',{carga:c1});assert.equal(estado.archivo.revision,c1);
   const enlace=await ok(dir,'/documentos/'+principal.id+'/pdf/abrir','POST',{descargar:true});const r=await fetch(enlace.url);assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),hash(b1));
   const antigua=manifest.objetos.find(o=>o.carga===c1);await ausente(antigua.clave_temporal);
   const c2=await cargar(dir,principal,b2,c1);estado=await ok(dir,'/documentos/'+principal.id+'/pdf/confirmar','POST',{carga:c2});assert.equal(estado.archivo.revision,c2);await ausente(antigua.clave_definitiva);
   const vigente=await ok(sec,'/documentos/'+principal.id+'/pdf/abrir','POST',{descargar:false});const descarga=await fetch(vigente.url);assert.equal(hash(Buffer.from(await descarga.arrayBuffer())),hash(b2));
   estado=await ok(sec,'/documentos/'+principal.id+'/pdf/eliminar','POST',{revision:c2,confirmar:true});assert.equal(estado.archivo,null);await ausente(manifest.objetos.find(o=>o.carga===c2).clave_definitiva);await ok(sec,'/documentos/'+principal.id);
   const h=(await ok(sec,'/documentos/'+principal.id+'/auditoria')).eventos;assert.ok(h.some(e=>e.accion==='PDF_REEMPLAZO'&&e.actor==='directora directora'));assert.ok(h.some(e=>e.accion==='PDF_ELIMINACION'&&e.actor==='secretaria secretaria'));
  });
  await t.test('Adjunto posterior real, formato falso, tamaño, permisos y limpieza pendiente recuperable',async()=>{
   assert.equal((await ok(sec,'/documentos/'+posterior.id+'/pdf')).archivo,null);
   assert.equal((await pedir(sec,'/documentos/'+posterior.id+'/pdf/cargas','POST',{nombre:'invalido.txt',mime:'text/plain',tamano:100,revision:null})).status,400);
   assert.equal((await pedir(sec,'/documentos/'+posterior.id+'/pdf/cargas','POST',{nombre:'grande.pdf',mime:'application/pdf',tamano:15*1024*1024+1,revision:null})).status,400);
   assert.equal((await pedir(admin,'/documentos/'+posterior.id+'/pdf')).status,404);assert.equal((await pedir(usr,'/documentos/'+posterior.id+'/pdf')).status,404);
   const falso=await cargar(sec,posterior,Buffer.from('ESTO NO ES UN PDF'));assert.equal((await pedir(sec,'/documentos/'+posterior.id+'/pdf/confirmar','POST',{carga:falso})).status,400);assert.equal((await ok(sec,'/documentos/'+posterior.id+'/pdf')).archivo,null);
   const carga=await cargar(sec,posterior,await bytes('PDF ADJUNTO POSTERIOR'));await ok(sec,'/documentos/'+posterior.id+'/pdf/confirmar','POST',{carga});
   const c3=await cargar(dir,posterior,await bytes('PDF CONCURRENCIA A'),carga),c4=await cargar(sec,posterior,await bytes('PDF CONCURRENCIA B'),carga);
   const r=await Promise.all([pedir(dir,'/documentos/'+posterior.id+'/pdf/confirmar','POST',{carga:c3}),pedir(sec,'/documentos/'+posterior.id+'/pdf/confirmar','POST',{carga:c4})]);assert.deepEqual(r.map(v=>v.status).sort(),[200,409]);
   const vigente=(await ok(sec,'/documentos/'+posterior.id+'/pdf')).archivo.revision;
   const conFallo=pdfDocumental(()=>({...almacen,eliminar:async()=>{throw Error('Fallo simulado de eliminación, solo prueba aislada');}}));const pendiente=await conFallo.eliminar(sec.id,posterior.id,vigente);assert.ok(pendiente.limpieza_pendiente>0);assert.equal(pendiente.archivo,null);
   // Adelanta únicamente objetos de estos registros ficticios para probar recuperación y temporales.
   await pool.query('UPDATE pdf_objetos_pendientes SET limpiar_desde=clock_timestamp() WHERE documento_id=$1 AND eliminado_en IS NULL',[posterior.id]);await pdfActual.limpiar(100,posterior.id);
   for(const o of manifest.objetos.filter(o=>o.documento===posterior.id)){await ausente(o.clave_temporal);await ausente(o.clave_definitiva);}
   assert.equal((await ok(sec,'/documentos/'+posterior.id+'/pdf')).limpieza_pendiente,0);
  });
 }finally{await guardar();await new Promise(r=>server.close(r));await pool.end();}
});
