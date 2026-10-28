import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {parse} from 'dotenv';
import pg from 'pg';
import {test} from 'node:test';
import {verificarConexionLocal} from '../src/config/local.ts';
import {generarToken} from '../src/shared/security/jwt.ts';
import {detalleDocumentoSchema} from '../../frontend/src/features/documentos/schemas/documentos.schema.ts';

test('Dirección propia: decisiones atómicas, entrega, privacidad y conservación local',async()=>{
 const conexion=parse(fs.readFileSync('.env')).DATABASE_URL,c=new pg.Client({connectionString:conexion});await c.connect();
 try{
  const identidad=await verificarConexionLocal(c,conexion),base='http://localhost:5173',marca='DIRLOCAL'+randomBytes(4).toString('hex');
  const tablas=['documentos','historial_modificaciones','movimientos_documentales','entregas_secretaria','entregas_secretaria_historial','documentos_relaciones'];
  const previos={};for(const t of tablas)previos[t]=(await c.query(`SELECT to_jsonb(t) fila FROM ${t} t ORDER BY to_jsonb(t)::text`)).rows;
  const perfiles={};for(const rol of ['Director(a)','Secretaria de Dirección','Usuario','Administrador'])perfiles[rol]=(await c.query('SELECT u.id::text,u.oficina_id::text,u.version_autenticacion FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.activo AND r.nombre=$1 ORDER BY u.id LIMIT 1',[rol])).rows[0];
  const tokens=Object.fromEntries(Object.entries(perfiles).map(([r,u])=>[r,generarToken(u.id,u.version_autenticacion)])),dir='Director(a)',sec='Secretaria de Dirección';let solicitudes=0;
  async function http(method,path,rol,body,status=200){await verificarConexionLocal(c,conexion);solicitudes++;const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+tokens[rol],Origin:base,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(d)}`);if(status<300&&d.documento)detalleDocumentoSchema.parse(d);return d;}
  const opciones=await http('GET','/api/documentos/opciones',dir);assert.equal(opciones.puede_decidir_registro,true);
  const tipo=opciones.tipos.find(t=>t.nombre==='Informe').id,ubicacion=opciones.ubicaciones_direccion[0];assert.ok(ubicacion);
  const guardar={accion:'GUARDAR_DIRECCION',estante_id:ubicacion.estante_id,archivador_id:ubicacion.id};
  const delegar={accion:'DELEGAR',oficina_id:null,usuario_id:null,nombre:'Destinatario local manual',observaciones:'Indicación de Dirección'};
  const body=clasificacion=>({tipo_documental_id:tipo,asunto:marca+' '+clasificacion,remitente:'Remitente conservado',observaciones:'Observación del documento',archivador_id:null,clasificacion_registro:clasificacion});
  const creados=[];
  for(const clasificacion of ['RECIBIDO','EMITIDO'])for(const decision of [undefined,delegar,guardar]){
   const d=(await http('POST','/api/documentos',dir,{...body(clasificacion),...(decision?{decision_inicial:decision}:{})},201)).documento;creados.push(d);
   assert.equal(d.registrado_por_id,perfiles[dir].id);assert.equal(d.clasificacion_registro,clasificacion);assert.equal(d.remitente,'Remitente conservado');assert.equal(d.observaciones,'Observación del documento');assert.equal(d.entrega.situacion,decision?.accion==='DELEGAR'?'DELEGADO':decision?'GUARDADO_DIRECCION':'PENDIENTE_DECISION');
   await http('GET','/api/documentos/'+d.id,sec);await http('GET','/api/documentos/'+d.id,'Usuario',undefined,404);
  }
  assert.equal(new Set(creados.map(d=>d.codigo)).size,6);
  const pendientes=creados.filter(d=>d.entrega.situacion==='PENDIENTE_DECISION');
  await http('POST',`/api/documentos/${pendientes[0].id}/delegar`,dir,{oficina_id:perfiles.Usuario.oficina_id,usuario_id:perfiles.Usuario.id,nombre:null,revision:0});
  await http('POST',`/api/documentos/${pendientes[1].id}/guardar-direccion`,dir,{estante_id:ubicacion.estante_id,archivador_id:ubicacion.id,revision:0});
  for(const d of [pendientes[0],...creados.filter(d=>d.entrega.situacion==='DELEGADO')]){
   const actual=(await http('GET','/api/documentos/'+d.id,sec)).documento;assert.equal(actual.permisos.confirmar_entrega,true);assert.equal(actual.permisos.editar,false);assert.equal(actual.permisos.anular,false);
   assert.ok((await http('GET','/api/dashboard',sec)).atencion.total>0);
   await http('POST',`/api/documentos/${d.id}/confirmar-entrega`,dir,{revision:1},403);
   const final=(await http('POST',`/api/documentos/${d.id}/confirmar-entrega`,sec,{revision:1})).documento;assert.equal(final.entrega.situacion,'ENTREGADO');assert.ok(final.entrega.confirmado_por);assert.equal(final.registrado_por_id,perfiles[dir].id);
   await http('POST',`/api/documentos/${d.id}/confirmar-entrega`,sec,{revision:2},409);
   await http('POST',`/api/documentos/${d.id}/delegar`,dir,{...delegar,accion:undefined,revision:2},409);
   assert.equal((await http('GET','/api/documentos/'+d.id,dir)).documento.entrega.situacion,'ENTREGADO');
  }
  const conteo=async()=> (await c.query("SELECT (SELECT count(*) FROM documentos)::int documentos,(SELECT count(*) FROM entregas_secretaria_historial)::int historia,(SELECT jsonb_agg(to_jsonb(t)) FROM correlativos_documentales t) correlativos")).rows[0];
  const antes=await conteo();
  await http('POST','/api/documentos',dir,{...body('RECIBIDO'),decision_inicial:{...delegar,oficina_id:perfiles[dir].oficina_id,usuario_id:perfiles.Usuario.id,nombre:null}},400);
  assert.deepEqual(await conteo(),antes);
  await http('POST','/api/documentos',dir,{...body('RECIBIDO'),decision_inicial:{...delegar,nombre:null}},400);
  await http('POST','/api/documentos',dir,{...body('RECIBIDO'),decision_inicial:{...guardar,nombre:'Contradicción'}},400);
  await http('POST','/api/documentos','Usuario',{...body('RECIBIDO'),decision_inicial:delegar},403);
  const ajeno=(await http('POST','/api/documentos','Usuario',body('RECIBIDO'),201)).documento;
  for(const rol of [dir,sec]){await http('GET','/api/documentos/'+ajeno.id,rol,undefined,404);assert.equal((await http('GET','/api/documentos?q='+ajeno.codigo,rol)).total,0);await http('GET',`/api/documentos/${ajeno.id}/historial`,rol,undefined,404);}
  await http('PUT','/api/documentos/'+creados[0].id,dir,{asunto:'Sin motivo',remitente:null,observaciones:null},400);
  await http('POST',`/api/documentos/${creados[0].id}/anular`,dir,{},400);
  const carrera=(await http('POST','/api/documentos',dir,body('EMITIDO'),201)).documento;
  async function intentar(ruta,datos,rol=dir){const r=await fetch(base+`/api/documentos/${carrera.id}/`+ruta,{method:'POST',headers:{Authorization:'Bearer '+tokens[rol],Origin:base,'Content-Type':'application/json'},body:JSON.stringify(datos)});await r.json();return r.status;}
  const simultaneas=await Promise.all([intentar('delegar',{oficina_id:perfiles.Usuario.oficina_id,usuario_id:null,nombre:null,revision:0}),intentar('guardar-direccion',{estante_id:ubicacion.estante_id,archivador_id:ubicacion.id,revision:0})]);
  assert.deepEqual(simultaneas.sort(),[200,409]);
  const decidido=(await http('GET','/api/documentos/'+carrera.id,sec)).documento;
  if(decidido.entrega.situacion==='DELEGADO')assert.deepEqual((await Promise.all([intentar('confirmar-entrega',{revision:1},sec),intentar('confirmar-entrega',{revision:1},sec)])).sort(),[200,409]);
  for(const t of tablas){const clave=t==='entregas_secretaria'||t==='documentos_relaciones'?'documento_id':'id',ids=new Set(previos[t].map(r=>String(r.fila[clave])));const filas=(await c.query(`SELECT to_jsonb(t) fila FROM ${t} t ORDER BY to_jsonb(t)::text`)).rows;assert.deepEqual(filas.filter(r=>ids.has(String(r.fila[clave]))),previos[t],t);}
  const informe={identidad,solicitudes,creados:creados.map(d=>({id:d.id,codigo:d.codigo,clasificacion:d.clasificacion_registro})),conservacion:true,rollback:true};console.log(informe);fs.mkdirSync('.private/local',{recursive:true});fs.writeFileSync('.private/local/direccion-propia.json',JSON.stringify(informe,null,2));
 }finally{await c.end();}
});
