import './helpers/exigir-aislamiento.mjs';
import {verificarEntornoPrueba} from './helpers/entorno-prueba.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {URL} from 'node:url';
import pg from 'pg';
import {permisos,lecturaSQL} from '../dist/shared/documental/nucleo.js';
import {alta,delegacion,correccion} from '../dist/modules/documentos/documentos.operaciones.js';
import {usuarioAlta} from '../dist/modules/usuarios/administracion.operaciones.js';
import {validarPdf} from '../dist/modules/documentos-pdf/pdf.storage.js';
import {generarHash,verificarContrasena} from '../dist/shared/security/password.js';
import {PDFDocument} from 'pdf-lib';
import {app} from '../dist/app.js';
import {pool} from '../dist/config/database.js';

test('Permisos puros: compartido, consulta institucional, delegado personal y anulado',()=>{
 const personal={id:'9',ambito_id:'20',registrado_por:'8',situacion:'PERSONAL',revision:'1'};
 const usuario={id:'8',rol_id:5,ambito_id:'20',activo:true,oficina_id:null};
 assert.deepEqual(permisos(usuario,personal),{relacionar:true,corregir:true,anular:true,delegar:true,ubicar:false,pdf:true});
 assert.equal(permisos({...usuario,oficina_id:'2'},personal).ubicar,true);
 const delegado={...personal,situacion:'DELEGADO'};
 assert.deepEqual(permisos(usuario,delegado),{relacionar:true,corregir:false,anular:false,delegar:false,ubicar:false,pdf:true});
 for(const rol_id of [1,2,3,4]){const externo={id:'4',rol_id,ambito_id:rol_id<3?null:'10',activo:true,oficina_id:null};assert.ok(Object.values(permisos(externo,personal)).every(v=>v===false));}
 for(const rol_id of [3,4]){const actor={id:'4',rol_id,ambito_id:'10',activo:true,oficina_id:'2'};assert.equal(permisos(actor,{...delegado,ambito_id:'10'}).pdf,true);assert.equal(permisos(actor,{...delegado,ambito_id:'10',situacion:'ANULADO'}).pdf,false);}
 assert.equal(permisos({...usuario,id:'99'},personal).pdf,false);
});
test('Contratos nuevos: campos obligatorios y persona obligatoria sin recepción ni cambio de dueño',()=>{
 for(const clasificacion of ['RECIBIDO','EMITIDO'])assert.equal(alta.safeParse({tipo_id:'1',clasificacion,asunto:'Documento'}).success,true);
 for(const body of [{tipo_id:'1',clasificacion:'RECIBIDO'},{clasificacion:'EMITIDO',asunto:'a'}])assert.equal(alta.safeParse(body).success,false);
 assert.equal(delegacion.safeParse({revision:'1',oficina_id:'2'}).success,false);
 assert.equal(delegacion.safeParse({revision:'1',usuario_id:'4'}).success,true);
 assert.equal(delegacion.safeParse({revision:'1',nombre:'Persona indicada'}).success,true);
 assert.equal(delegacion.safeParse({revision:'1',usuario_id:'4',nombre:'Otra'}).success,false);
 assert.equal(delegacion.safeParse({revision:'1',nombre:'Persona',responsable_actual_id:'4'}).success,false);
 assert.equal(correccion.safeParse({revision:'1',asunto:'a',motivo:''}).success,false);
 assert.equal(usuarioAlta.safeParse({nombre:'a',apellido:'b',nombre_usuario:'abc',rol_id:5,contrasena:'corta'}).success,false);
 for(const n of [7,8,128,129])assert.equal(usuarioAlta.shape.contrasena.safeParse('x'.repeat(n)).success,n>=8&&n<=128);
});
test('Hash existente compatible sin guardar la contraseña ni crear cuenta',async()=>{
 const secreto=randomBytes(32).toString('hex'),hash=await generarHash(secreto);
 assert.equal(await verificarContrasena(secreto,hash),true);assert.equal(await verificarContrasena(randomBytes(20).toString('hex'),hash),false);
});
test('PDF: firma y estructura reales; formato falso no aceptado',async()=>{
 const p=await PDFDocument.create();p.addPage();const bytes=await p.save();await validarPdf(bytes,bytes.length);
 await assert.rejects(validarPdf(Buffer.from('%PDF-1.7\nincorrecto\n%%EOF'),27));
});
test('HTTP nuevo: salud, validación y rutas retiradas; sin cuentas ni datos de prueba',async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/api/health')).status,200);
 for(const ruta of ['/api/siseve/acceso','/api/movimientos'])assert.equal((await fetch(base+ruta)).status,404);
 for(const ruta of ['/api/documentos','/api/usuarios','/api/campos-opcionales','/api/ubicaciones'])assert.equal((await fetch(base+ruta)).status,401);
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(login.status,400);
 }finally{await new Promise(r=>server.close(r));}
});
test('PostgreSQL aislado: identidad, esquema, acceso SQL y bloqueo concurrente sin insertar usuarios',async()=>{
 const esperado=await verificarEntornoPrueba(pool),url=process.env.DATABASE_URL;assert.equal(new URL(url).pathname,'/'+esperado.base);
 const a=new pg.Client({connectionString:url}),b=new pg.Client({connectionString:url});await a.connect();await b.connect();
 try{
  await verificarEntornoPrueba(a);await verificarEntornoPrueba(b);
  const i=(await a.query("SELECT current_database() base,(SELECT oid::text FROM pg_database WHERE datname=current_database()) oid,current_schema() esquema")).rows[0];assert.equal(i.base,esperado.base);assert.equal(i.esquema,'public');assert.match(i.oid,/^[1-9]\d*$/);
  assert.equal((await a.query('SELECT count(*)::int n FROM roles')).rows[0].n,5);
  assert.equal((await a.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='pdf_cargas' AND column_name='revision_esperada'")).rows[0].n,1);
  const antes=(await a.query('SELECT count(*)::int n FROM usuarios')).rows[0].n;
  const total=(await a.query("SELECT count(*)::int total,count(*) FILTER(WHERE situacion<>'ANULADO')::int ordinarios FROM documentos")).rows[0];
  for(const rol of [1,2,3,4,5]){const q=await a.query(`SELECT count(*)::int n FROM documentos d WHERE ${lecturaSQL}`,['1',rol,null]);assert.equal(q.rows[0].n,rol===1?total.total:[3,4].includes(rol)?total.ordinarios:0);}
  const esperados={1:[1,2,3],2:[],3:[1,2],4:[1,2],5:[1]};
  for(const rol of [1,2,3,4,5]){
   const visibles=(await a.query(`WITH d(id,ambito_id,situacion) AS (VALUES (1,20::bigint,'PERSONAL'),(2,30::bigint,'DELEGADO'),(3,20::bigint,'ANULADO')) SELECT id FROM d WHERE ${lecturaSQL} ORDER BY id`,['1',rol,'20'])).rows.map(r=>r.id);
   assert.deepEqual(visibles,esperados[rol]);
  }
  await a.query('BEGIN');await b.query('BEGIN');await a.query("SELECT pg_advisory_xact_lock(hashtext('documental-configuracion'))");
  assert.equal((await b.query("SELECT pg_try_advisory_xact_lock(hashtext('documental-configuracion')) ok")).rows[0].ok,false);
  await a.query('ROLLBACK');assert.equal((await b.query("SELECT pg_try_advisory_xact_lock(hashtext('documental-configuracion')) ok")).rows[0].ok,true);await b.query('ROLLBACK');
  assert.equal((await a.query('SELECT count(*)::int n FROM usuarios')).rows[0].n,antes);
 }finally{await a.end();await b.end();await pool.end();}
});
