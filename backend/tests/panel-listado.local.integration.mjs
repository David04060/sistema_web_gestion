import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {parse} from 'dotenv';
import pg from 'pg';
import {test} from 'node:test';
import {verificarConexionLocal} from '../src/config/local.ts';
import {generarToken} from '../src/shared/security/jwt.ts';
import {dashboardSchema} from '../../frontend/src/features/dashboard/schemas/dashboard.schema.ts';
import {detalleDocumentoSchema,listaDocumentosSchema} from '../../frontend/src/features/documentos/schemas/documentos.schema.ts';
import {listaMovimientosSchema} from '../../frontend/src/features/movimientos/schemas/movimientos.schema.ts';

test('Panel, listado, auditoría y registro por perfil en sistema_web_final',async()=>{
 const conexion=parse(fs.readFileSync('.env')).DATABASE_URL;const c=new pg.Client({connectionString:conexion});await c.connect();
 const base='http://localhost:5173',marca='PANELLOCAL'+randomBytes(4).toString('hex');let solicitudes=0;const creados=[];
 try{
  const identidad=await verificarConexionLocal(c,conexion);
  const tablas=['documentos','movimientos_documentales','historial_modificaciones','entregas_secretaria','entregas_secretaria_historial','documentos_relaciones'];
  const previos={};for(const t of tablas)previos[t]=(await c.query(`SELECT to_jsonb(t) fila FROM ${t} t ORDER BY to_jsonb(t)::text`)).rows;
  const perfiles=Object.fromEntries((await c.query('SELECT u.id::text,u.version_autenticacion,r.nombre rol FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.activo ORDER BY u.id')).rows.map(u=>[u.rol,u]));
  const tokens=Object.fromEntries(Object.entries(perfiles).map(([rol,u])=>[rol,generarToken(u.id,u.version_autenticacion)]));
  const sec='Secretaria de Dirección',dir='Director(a)';
  async function http(method,path,rol,body,status=200){await verificarConexionLocal(c,conexion);solicitudes++;const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+tokens[rol],Origin:base,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();assert.equal(r.status,status,`${method} ${path}: ${d.error??r.status}`);if(status<300){if(path==='/api/dashboard')dashboardSchema.parse(d);if(d.documento)detalleDocumentoSchema.parse(d);if(d.documentos)listaDocumentosSchema.parse(d);if(d.movimientos)listaMovimientosSchema.parse(d);}return d;}
  const tipo=(await http('GET','/api/documentos/opciones',sec)).tipos.find(t=>t.nombre==='Informe').id;
  const body=(clasificacion)=>({tipo_documental_id:tipo,asunto:marca+' '+clasificacion,remitente:null,observaciones:'Comprobación local de listado y panel',archivador_id:null,clasificacion_registro:clasificacion});
  for(const rol of ['Usuario',sec,dir])for(const clasificacion of ['RECIBIDO','EMITIDO']){
   const d=(await http('POST','/api/documentos',rol,body(clasificacion),201)).documento;creados.push({...d,rol});assert.equal(d.clasificacion_registro,clasificacion);assert.equal(d.registrado_por_id,perfiles[rol].id);
  }
  assert.equal(new Set(creados.map(d=>d.codigo)).size,6);
  await http('POST','/api/documentos','Administrador',body('RECIBIDO'),403);
  for(const rol of [sec,dir])for(const d of creados.filter(d=>d.rol==='Usuario')){
   await http('GET','/api/documentos/'+d.id,rol,undefined,404);await http('GET',`/api/documentos/${d.id}/historial`,rol,undefined,404);
   assert.equal((await http('GET','/api/documentos?q='+encodeURIComponent(d.codigo),rol)).total,0);
  }
  for(const rol of ['Usuario',sec,dir,'Administrador']){
   const l=await http('GET','/api/documentos?q='+marca,rol);const esperados=creados.filter(d=>rol==='Administrador'?false:rol==='Usuario'?d.rol===rol:d.rol===sec||d.rol===dir).map(d=>d.id).sort();assert.deepEqual(l.documentos.map(d=>d.id).sort(),esperados);assert.equal(l.total,esperados.length);
  }
  const nuevoSec=creados.find(d=>d.rol===sec&&d.clasificacion_registro==='EMITIDO');
  async function comprobarPanel(rol){const p=await http('GET','/api/dashboard',rol);const situacion=rol===dir?'PENDIENTE_DECISION':'DELEGADO';const esperados=(await c.query("SELECT d.id::text FROM documentos d JOIN tipos_documentales td ON td.id=d.tipo_documental_id JOIN entregas_secretaria f ON f.documento_id=d.id JOIN usuarios u ON u.id=d.registrado_por_id JOIN roles r ON r.id=u.rol_id WHERE d.activo AND NOT td.requiere_clave AND lower(btrim(td.nombre))<>'síseve' AND (r.nombre='Secretaria de Dirección' OR (NOT $2::boolean AND r.nombre='Director(a)')) AND f.situacion=$1 AND ($2::boolean OR r.nombre='Director(a)' OR d.registrado_por_id=$3::bigint)",[situacion,rol===dir,perfiles[rol].id])).rows.map(r=>r.id);assert.equal(p.atencion.total,esperados.length);assert.ok(p.atencion.documentos.length<=8);assert.ok(p.atencion.documentos.every(d=>esperados.includes(d.id)));return p.atencion;}
  const inicialDir=await comprobarPanel(dir);assert.ok(inicialDir.total>0);if(inicialDir.total<=8)assert.ok(inicialDir.documentos.some(d=>d.id===nuevoSec.id));
  for(const rol of ['Usuario','Administrador'])assert.equal((await http('GET','/api/dashboard',rol)).atencion,null);
  await http('POST',`/api/documentos/${nuevoSec.id}/delegar`,dir,{oficina_id:null,usuario_id:null,nombre:'Persona de verificación local',revision:0});
  assert.ok(!(await comprobarPanel(dir)).documentos.some(d=>d.id===nuevoSec.id));assert.ok((await comprobarPanel(sec)).documentos.some(d=>d.id===nuevoSec.id));
  await http('POST',`/api/documentos/${nuevoSec.id}/confirmar-entrega`,sec,{revision:1});assert.ok(!(await comprobarPanel(sec)).documentos.some(d=>d.id===nuevoSec.id));
  await http('POST',`/api/documentos/${nuevoSec.id}/confirmar-entrega`,sec,{revision:2},409);
  const propio=creados.find(d=>d.rol==='Usuario');
  await http('PUT','/api/documentos/'+propio.id,'Usuario',{asunto:'Sin motivo',remitente:null,observaciones:null},400);
  await http('POST',`/api/documentos/${propio.id}/anular`,'Usuario',{},400);
  const auditado=(await c.query("SELECT d.id::text FROM documentos d JOIN usuarios u ON u.id=d.registrado_por_id JOIN roles r ON r.id=u.rol_id JOIN tipos_documentales td ON td.id=d.tipo_documental_id JOIN historial_modificaciones h ON h.registro_id=d.id AND h.tabla='documentos' WHERE r.nombre='Secretaria de Dirección' AND NOT td.requiere_clave AND h.campos_modificados ? 'registrado_por_id' ORDER BY d.id LIMIT 1")).rows[0];
  const hist=(await http('GET',`/api/documentos/${auditado.id}/historial`,sec)).historial;const registro=hist.find(h=>typeof h.campos_modificados.registrado_por_id==='number'||typeof h.campos_modificados.registrado_por_id==='string');assert.ok(registro.campos_presentacion);assert.equal(typeof registro.campos_presentacion.registrado_por_id,'string');assert.ok(!/^[0-9]+$/.test(registro.campos_presentacion.registrado_por_id));assert.ok(!('id' in registro.campos_presentacion));
  const mov=await http('GET','/api/movimientos?limite=100',sec);for(const m of mov.movimientos){assert.ok(m.registrado_por);if(m.decidido_por_id)assert.ok(m.decidido_por);if(m.recibido_por_id)assert.ok(m.recibido_por);const detalle=await http('GET','/api/movimientos/'+m.id,sec);assert.equal(detalle.movimiento.registrado_por,m.registrado_por);}
  // Ninguna proyección de auditoría o nombres escribe sobre antecedentes existentes.
  for(const t of tablas){const filas=(await c.query(`SELECT to_jsonb(t) fila FROM ${t} t ORDER BY to_jsonb(t)::text`)).rows;
   const anteriores=previos[t];const clave=t==='entregas_secretaria'?'documento_id':t==='documentos_relaciones'?'documento_id':'id';const ids=new Set(anteriores.map(r=>String(r.fila[clave])));assert.deepEqual(filas.filter(r=>ids.has(String(r.fila[clave]))),anteriores,t);}
  const informe={identidad,baseHTTP:base,solicitudes,creados:creados.map(d=>({id:d.id,codigo:d.codigo,rol:d.rol,clasificacion:d.clasificacion_registro})),antecedentesConservados:true};console.log(informe);fs.mkdirSync('.private/local',{recursive:true});fs.writeFileSync('.private/local/panel-listado.json',JSON.stringify(informe,null,2));
 }finally{await c.end();}
});


