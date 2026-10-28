import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {parse} from 'dotenv';
import pg from 'pg';
import {test} from 'node:test';
import {verificarConexionLocal} from '../src/config/local.ts';
import {generarToken} from '../src/shared/security/jwt.ts';
import {detalleDocumentoSchema,listaDocumentosSchema} from '../../frontend/src/features/documentos/schemas/documentos.schema.ts';

test('Usuario local: registro, delegación personal, movimientos, privacidad y conservación',async()=>{
 const url=parse(fs.readFileSync('.env')).DATABASE_URL,c=new pg.Client({connectionString:url});await c.connect();
 try{
  const identidad=await verificarConexionLocal(c,url),base='http://localhost:5173',marca='PERSONAL'+randomBytes(4).toString('hex');let solicitudes=0;
  const roles={};for(const rol of ['Usuario','Director(a)','Secretaria de Dirección','Administrador']){const u=(await c.query('SELECT u.id::text,u.oficina_id::text,u.version_autenticacion FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.activo AND r.nombre=$1 ORDER BY u.id LIMIT 1',[rol])).rows[0];roles[rol]={...u,token:generarToken(u.id,u.version_autenticacion)};}
  const tablas=['documentos','historial_modificaciones','movimientos_documentales','documentos_relaciones','entregas_secretaria','entregas_secretaria_historial','delegaciones_personales'],previos={};for(const t of tablas)previos[t]=(await c.query(`SELECT to_jsonb(t) fila FROM ${t} t ORDER BY to_jsonb(t)::text`)).rows;
  async function http(method,path,rol,body,status=200){await verificarConexionLocal(c,url);solicitudes++;const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+roles[rol].token,Origin:base,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(d)}`);if(status<300&&d.documento)detalleDocumentoSchema.parse(d);if(d.documentos)listaDocumentosSchema.parse(d);return d;}
  const op=await http('GET','/api/documentos/opciones','Usuario');assert.equal(op.puede_delegar_personal,true);assert.equal(op.puede_decidir_registro,false);
  const body=cl=>({tipo_documental_id:op.tipos.find(t=>t.nombre==='Informe').id,asunto:marca+' '+cl,remitente:'Remitente personal',observaciones:'Registro de prueba local',archivador_id:null,clasificacion_registro:cl});
  const registrados=[];
  for(const cl of ['RECIBIDO','EMITIDO']){const d=(await http('POST','/api/documentos','Usuario',body(cl),201)).documento;registrados.push(d);assert.equal(d.entrega,null);assert.equal(d.registro_personal,true);assert.equal(d.permisos.delegar_personal,true);assert.equal(d.clasificacion_registro,cl);}
  const registrado={oficina_id:roles['Director(a)'].oficina_id,usuario_id:roles['Director(a)'].id,nombre:null,destino_manual:null};
  const manual={oficina_id:null,usuario_id:null,nombre:'Persona externa de verificación',destino_manual:'Destino externo local'};
  for(const [cl,delegacion] of [['RECIBIDO',registrado],['EMITIDO',manual]]){const d=(await http('POST','/api/documentos','Usuario',{...body(cl),archivador_id:op.archivadores[0]?.id??null,delegacion_personal:delegacion},201)).documento;registrados.push(d);assert.equal(d.entrega.situacion,'DELEGADO');assert.equal(d.registrado_por_id,roles.Usuario.id);assert.equal(d.responsable_actual_id,roles.Usuario.id);assert.equal(d.archivador_id,op.archivadores[0]?.id??null);}
  const id=registrados[0].id;
  await http('POST',`/api/documentos/${id}/delegar-personal`,'Usuario',{oficina_id:roles['Director(a)'].oficina_id});
  assert.equal((await http('GET','/api/documentos/'+id,'Usuario')).documento.entrega.situacion,'DELEGADO');
  assert.ok((await http('GET',`/api/documentos/${id}/historial`,'Usuario')).historial.some(h=>h.accion==='Delegación personal'&&h.actor));
  await http('POST',`/api/documentos/${id}/delegar-personal`,'Usuario',manual,409);
  await http('POST',`/api/documentos/${id}/confirmar-entrega`,'Usuario',{revision:0},403);
  const simultaneas=await Promise.all([manual,{nombre:'Otra persona'}].map(async body=>{const r=await fetch(base+`/api/documentos/${registrados[1].id}/delegar-personal`,{method:'POST',headers:{Authorization:'Bearer '+roles.Usuario.token,Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});await r.json();return r.status;}));assert.deepEqual(simultaneas.sort(),[200,409]);
  for(const d of registrados)for(const rol of ['Director(a)','Secretaria de Dirección','Administrador']){await http('GET','/api/documentos/'+d.id,rol,undefined,404);await http('GET',`/api/documentos/${d.id}/historial`,rol,undefined,404);await http('POST',`/api/documentos/${d.id}/delegar-personal`,rol,manual,404);assert.equal((await http('GET','/api/documentos?q='+d.codigo,rol)).total,0);}
  const ajeno=(await c.query("SELECT d.id::text FROM documentos d JOIN usuarios u ON u.id=d.registrado_por_id JOIN roles r ON r.id=u.rol_id JOIN tipos_documentales td ON td.id=d.tipo_documental_id WHERE r.nombre='Director(a)' AND NOT td.requiere_clave ORDER BY d.id LIMIT 1")).rows[0].id;
  await http('GET','/api/documentos/'+ajeno,'Usuario',undefined,404);await http('POST',`/api/documentos/${ajeno}/delegar-personal`,'Usuario',manual,404);
  const movimientos=await http('GET','/api/movimientos?limite=100','Usuario');assert.ok(movimientos.delegaciones.length>=4);assert.equal(movimientos.movimientos,undefined);
  const esperadas=(await c.query('SELECT p.documento_id::text FROM delegaciones_personales p JOIN documentos d ON d.id=p.documento_id WHERE d.registrado_por_id=$1',[roles.Usuario.id])).rows.map(d=>d.documento_id).sort();assert.deepEqual(movimientos.delegaciones.map(d=>d.documento_id).sort(),esperadas);assert.equal(movimientos.total,esperadas.length);
  assert.equal((await http('GET','/api/movimientos?documento_id='+ajeno,'Usuario')).total,0);
  assert.equal((await http('GET','/api/documentos?q='+marca+'&situacion=DELEGADO','Usuario')).total,4);
  const anterior=(await c.query('SELECT count(*)::int n FROM documentos')).rows[0].n;
  await http('POST','/api/documentos','Usuario',{...body('EMITIDO'),delegacion_personal:{...registrado,oficina_id:roles.Usuario.oficina_id}},400);assert.equal((await c.query('SELECT count(*)::int n FROM documentos')).rows[0].n,anterior);
  await http('POST','/api/documentos','Usuario',{...body('EMITIDO'),delegacion_personal:{}},400);
  await http('POST','/api/documentos','Usuario',{...body('EMITIDO'),delegacion_personal:{oficina_id:'9223372036854775806'}},400);
  await http('POST','/api/movimientos','Usuario',{documento_id:id,usuario_destino_id:roles['Director(a)'].id,motivo:'Intento circuito anterior'},403);
  // El flujo institucional no incorpora delegaciones personales ni cambia los recorridos existentes.
  for(const rol of ['Director(a)','Secretaria de Dirección']){await http('GET','/api/documentos/opciones',rol);await http('GET','/api/dashboard',rol);await http('GET','/api/movimientos',rol);}
  const dir=(await http('GET','/api/documentos/'+ajeno,'Director(a)')).documento;assert.equal(dir.registro_personal,false);
  for(const t of tablas){const clave=['entregas_secretaria','documentos_relaciones','delegaciones_personales'].includes(t)?'documento_id':'id',ids=new Set(previos[t].map(r=>String(r.fila[clave]))),ahora=(await c.query(`SELECT to_jsonb(t) fila FROM ${t} t ORDER BY to_jsonb(t)::text`)).rows;assert.deepEqual(ahora.filter(r=>ids.has(String(r.fila[clave]))),previos[t],t);}
  const informe={identidad,solicitudes,concurrencia:simultaneas,creados:registrados.map(d=>({id:d.id,codigo:d.codigo})),antecedentesConservados:true};console.log(informe);fs.mkdirSync('.private/local',{recursive:true});fs.writeFileSync('.private/local/delegacion-personal.json',JSON.stringify(informe,null,2));
 }finally{await c.end();}
});
