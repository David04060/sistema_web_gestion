import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from 'dotenv';
import pg from 'pg';
import {test} from 'node:test';
import {verificarConexionLocal} from '../src/config/local.ts';
import {generarToken} from '../src/shared/security/jwt.ts';
import {detalleDocumentoSchema,opcionesSchema} from '../../frontend/src/features/documentos/schemas/documentos.schema.ts';

test('Secretaría delega o guarda en su oficina; Usuario registra recibido y emitido',async()=>{
 const url=parse(fs.readFileSync('.env')).DATABASE_URL,c=new pg.Client({connectionString:url});await c.connect();
 try{
  const identidad=await verificarConexionLocal(c,url),base='http://localhost:5173';let solicitudes=0;
  const roles={};for(const rol of ['Secretaria de Dirección','Director(a)','Usuario']){const u=(await c.query('SELECT u.id::text,u.oficina_id::text,u.version_autenticacion FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.activo AND r.nombre=$1 ORDER BY u.id LIMIT 1',[rol])).rows[0];roles[rol]={...u,token:generarToken(u.id,u.version_autenticacion)};}
  const sec='Secretaria de Dirección',dir='Director(a)';
  const tablas=['documentos','historial_modificaciones','movimientos_documentales','documentos_relaciones','entregas_secretaria','entregas_secretaria_historial'],previos={};
  for(const t of tablas)previos[t]=(await c.query(`SELECT to_jsonb(t) fila FROM ${t} t ORDER BY to_jsonb(t)::text`)).rows;
  async function http(method,ruta,rol,body,status=200){await verificarConexionLocal(c,url);solicitudes++;const r=await fetch(base+ruta,{method,headers:{Authorization:'Bearer '+roles[rol].token,Origin:base,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));if(status<300&&d.documento)detalleDocumentoSchema.parse(d);return d;}
  let op=opcionesSchema.parse(await http('GET','/api/documentos/opciones',sec));assert.equal(op.puede_decidir_registro,true);assert.equal(op.nombre_guardado,'Guardar en Secretaría');
  if(!op.ubicaciones_direccion.length){const e=(await http('POST','/api/ubicaciones/estantes',sec,{codigo:'SECRETARIA',usuario_id:roles[sec].id,oficina_id:roles[sec].oficina_id},201)).estante;await http('POST','/api/ubicaciones/archivadores',sec,{estante_id:e.id,numero:1},201);op=opcionesSchema.parse(await http('GET','/api/documentos/opciones',sec));}
  const lugar=op.ubicaciones_direccion[0];assert.ok(lugar,'Se requiere ubicación existente de Secretaría para comprobar guardado');
  const tipo=op.tipos.find(t=>t.nombre==='Informe').id;
  const body=clasificacion=>({tipo_documental_id:tipo,asunto:'Verificación local Secretaría '+clasificacion,remitente:'Dirección / Secretaría',observaciones:'Comprobación del flujo compartido',clasificacion_registro:clasificacion,archivador_id:null});
  const guardar={accion:'GUARDAR_DIRECCION',estante_id:lugar.estante_id,archivador_id:lugar.id};
  const delegar={accion:'DELEGAR',oficina_id:null,usuario_id:null,nombre:'Persona de verificación local',observaciones:null};const creados=[];
  for(const clasificacion of ['RECIBIDO','EMITIDO']){
   const guardado=(await http('POST','/api/documentos',sec,{...body(clasificacion),decision_inicial:guardar},201)).documento;creados.push(guardado);
   assert.equal(guardado.entrega.situacion,'GUARDADO_SECRETARIA');assert.equal(guardado.remitente,'Dirección / Secretaría');
   assert.equal((await http('GET','/api/documentos/'+guardado.id,dir)).documento.entrega.situacion,'GUARDADO_SECRETARIA');
   await http('POST',`/api/documentos/${guardado.id}/delegar`,sec,{...delegar,accion:undefined,revision:1},409);
   const d=(await http('POST','/api/documentos',sec,body(clasificacion),201)).documento;creados.push(d);assert.equal(d.entrega.situacion,'PENDIENTE_DECISION');assert.equal(d.permisos.asignar_destinatario,true);
   await http('POST',`/api/documentos/${d.id}/delegar`,sec,{...delegar,accion:undefined,revision:0});
   assert.equal((await http('POST',`/api/documentos/${d.id}/confirmar-entrega`,sec,{revision:1})).documento.entrega.situacion,'ENTREGADO');
   await http('POST',`/api/documentos/${d.id}/confirmar-entrega`,sec,{revision:2},409);
   const u=(await http('POST','/api/documentos','Usuario',body(clasificacion),201)).documento;creados.push(u);assert.equal(u.clasificacion_registro,clasificacion);assert.equal(u.entrega,null);
   for(const lector of [sec,dir])await http('GET','/api/documentos/'+u.id,lector,undefined,404);
  }
  const propioDir=(await http('POST','/api/documentos',dir,body('EMITIDO'),201)).documento;creados.push(propioDir);
  await http('POST',`/api/documentos/${propioDir.id}/guardar-direccion`,sec,{estante_id:lugar.estante_id,archivador_id:lugar.id,revision:0});
  await http('POST','/api/documentos','Usuario',{...body('EMITIDO'),decision_inicial:delegar},403);
  const ubicacionDir=(await http('GET','/api/documentos/opciones',dir)).ubicaciones_direccion[0];
  await http('POST','/api/documentos',sec,{...body('EMITIDO'),decision_inicial:{...guardar,estante_id:ubicacionDir.estante_id,archivador_id:ubicacionDir.id}},400);
  for(const t of tablas){const clave=t==='entregas_secretaria'||t==='documentos_relaciones'?'documento_id':'id',ids=new Set(previos[t].map(r=>String(r.fila[clave]))),actuales=(await c.query(`SELECT to_jsonb(t) fila FROM ${t} t ORDER BY to_jsonb(t)::text`)).rows;assert.deepEqual(actuales.filter(r=>ids.has(String(r.fila[clave]))),previos[t],t);}
  console.log({identidad,solicitudes,creados:creados.map(d=>({id:d.id,codigo:d.codigo})),antecedentesConservados:true});
 }finally{await c.end();}
});
