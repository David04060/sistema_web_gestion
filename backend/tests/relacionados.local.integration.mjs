import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from 'dotenv';
import pg from 'pg';
import {test} from 'node:test';
import {randomBytes} from 'node:crypto';
import {verificarConexionLocal,validarUrlLocal} from '../src/config/local.ts';
import {generarToken} from '../src/shared/security/jwt.ts';
import {detalleDocumentoSchema,listaDocumentosSchema,opcionesSchema} from '../../frontend/src/features/documentos/schemas/documentos.schema.ts';

test('Relaciones locales: acceso recíproco, FUT/informe, atomicidad y conservación',async()=>{
 const conexion=process.env.DATABASE_URL??parse(fs.readFileSync('.env')).DATABASE_URL;validarUrlLocal(conexion);
 const c=new pg.Client({connectionString:conexion});await c.connect();
 const base='http://localhost:5173';let solicitudes=0;const creados=[];
 const marca='RELLOCAL'+randomBytes(4).toString('hex');let trigger=false;
 try{
  const identidad=await verificarConexionLocal(c,conexion);
  const usuarios=(await c.query('SELECT u.id::text,u.oficina_id::text,u.version_autenticacion,r.nombre rol FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.activo ORDER BY u.id')).rows;
  const perfiles=Object.fromEntries(usuarios.map(u=>[u.rol,u]));
  for(const rol of ['Secretaria de Dirección','Director(a)','Usuario','Administrador'])assert.ok(perfiles[rol]);
  const tokens=Object.fromEntries(Object.entries(perfiles).map(([rol,u])=>[rol,generarToken(u.id,u.version_autenticacion)]));
  const sec='Secretaria de Dirección',dir='Director(a)';
  async function http(method,path,rol,body,status=200){
   await verificarConexionLocal(c,conexion);solicitudes++;
   const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+tokens[rol],Origin:base,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
   const data=await r.json();assert.equal(r.status,status,`${method} ${path}: ${data.error??r.status}`);
   if(status<300){if(data.documento)detalleDocumentoSchema.parse(data);if(data.documentos)listaDocumentosSchema.parse(data);if(path==='/api/documentos/opciones')opcionesSchema.parse(data);}
   return data;
  }
  const tipos=(await http('GET','/api/documentos/opciones',sec)).tipos;
  const fut=tipos.find(t=>t.nombre==='FUT').id,informe=tipos.find(t=>t.nombre==='Informe').id;
  const body=(tipo,asunto,origen)=>({tipo_documental_id:tipo,asunto,remitente:null,observaciones:'Observaciones propias '+marca,archivador_id:null,clasificacion_registro:'RECIBIDO',...(origen?{documento_origen_id:origen}:{})});
  async function registrar(rol,tipo,asunto,origen){const d=(await http('POST','/api/documentos',rol,body(tipo,asunto,origen),201)).documento;creados.push(d.id);return d;}
  const fuente=await registrar(sec,fut,marca+' FUT de origen');
  const propioDir=await registrar(dir,informe,marca+' Registro de Dirección');
  const personal=await registrar('Usuario',informe,marca+' Registro personal');
  for(const [rol,id] of [[dir,fuente.id],[sec,propioDir.id]]){
   await http('GET','/api/documentos/'+id,rol);await http('GET',`/api/documentos/${id}/historial`,rol);
   await http('PUT','/api/documentos/'+id,rol,{asunto:'No permitido',remitente:null,observaciones:null,motivo:'Verificación de privacidad'},403);
   await http('POST',`/api/documentos/${id}/anular`,rol,{motivo:'Verificación de privacidad'},403);
  }
  for(const rol of [sec,dir,'Administrador']){
   await http('GET','/api/documentos/'+personal.id,rol,undefined,404);await http('GET',`/api/documentos/${personal.id}/historial`,rol,undefined,404);
  }
  for(const rol of [sec,dir]){
   for(const q of [fuente.codigo,marca+' FUT']){const l=await http('GET','/api/documentos?q='+encodeURIComponent(q),rol);assert.ok(l.documentos.some(d=>d.id===fuente.id));}
   const opciones=await http('GET','/api/documentos/opciones',rol);
   const l=await http('GET','/api/documentos?limite=100',rol);
   const esperado=(await c.query("SELECT d.id::text FROM documentos d JOIN usuarios u ON u.id=d.registrado_por_id JOIN roles r ON r.id=u.rol_id JOIN tipos_documentales td ON td.id=d.tipo_documental_id WHERE NOT td.requiere_clave AND lower(btrim(td.nombre))<>'síseve' AND (d.registrado_por_id=$1 OR r.nombre=$2)",[perfiles[rol].id,rol===sec?dir:sec])).rows.map(r=>r.id).sort();
   assert.deepEqual(l.documentos.map(d=>d.id).sort(),esperado);assert.equal(l.total,esperado.length);assert.ok(opciones.filtros.every(f=>l.documentos.some(d=>d.responsable_actual_id===f.responsable_id&&d.oficina_responsable_id===f.oficina_id)));
   const dash=await http('GET','/api/dashboard',rol);assert.equal(dash.indicadores.find(i=>i.clave==='documentos').total,esperado.length);assert.ok(dash.recientes.every(d=>esperado.includes(d.id)));
  }
  await http('POST',`/api/documentos/${fuente.id}/delegar`,dir,{oficina_id:perfiles.Usuario.oficina_id,usuario_id:perfiles.Usuario.id,nombre:null,observaciones:'Delegación original',revision:0});
  await http('POST',`/api/documentos/${fuente.id}/confirmar-entrega`,sec,{revision:1});
  async function instantanea(id){return {
   d:(await c.query('SELECT to_jsonb(d) fila FROM documentos d WHERE id=$1',[id])).rows,
   f:(await c.query('SELECT to_jsonb(f) fila FROM entregas_secretaria f WHERE documento_id=$1',[id])).rows,
   h:(await c.query("SELECT to_jsonb(h) fila FROM historial_modificaciones h WHERE tabla='documentos' AND registro_id=$1 ORDER BY id",[id])).rows,
   eh:(await c.query('SELECT to_jsonb(h) fila FROM entregas_secretaria_historial h WHERE documento_id=$1 ORDER BY id',[id])).rows,
   m:(await c.query('SELECT to_jsonb(m) fila FROM movimientos_documentales m WHERE documento_id=$1 ORDER BY id',[id])).rows,
  };}
  const antes=await instantanea(fuente.id);
  const nuevo=await registrar(sec,informe,marca+' Informe relacionado',fuente.id);
  assert.notEqual(nuevo.id,fuente.id);assert.notEqual(nuevo.codigo,fuente.codigo);assert.equal(nuevo.registrado_por_id,perfiles[sec].id);assert.equal(nuevo.entrega.situacion,'PENDIENTE_DECISION');assert.equal(nuevo.documento_origen.id,fuente.id);
  assert.deepEqual(await instantanea(fuente.id),antes);
  for(const rol of [sec,dir]){
   const origen=(await http('GET','/api/documentos/'+fuente.id,rol)).documento;assert.equal(origen.entrega.situacion,'ENTREGADO');assert.ok(origen.documentos_relacionados.some(d=>d.id===nuevo.id));
   const hijo=(await http('GET','/api/documentos/'+nuevo.id,rol)).documento;assert.equal(hijo.documento_origen.codigo,fuente.codigo);assert.ok(hijo.documento_origen.relacion_por);assert.ok(hijo.documento_origen.relacion_fecha);
  }
  await http('GET','/api/documentos/'+nuevo.id,'Usuario',undefined,404);
  const ubicacion=(await http('GET','/api/documentos/opciones',dir)).ubicaciones_direccion[0];assert.ok(ubicacion);
  const guardado=(await http('POST',`/api/documentos/${nuevo.id}/guardar-direccion`,dir,{estante_id:ubicacion.estante_id,archivador_id:ubicacion.id,revision:0})).documento;assert.equal(guardado.entrega.situacion,'GUARDADO_DIRECCION');
  const antesGuardado=await instantanea(nuevo.id);
  const siguiente=await registrar(sec,informe,marca+' Desde guardado',nuevo.id);assert.equal(siguiente.documento_origen.id,nuevo.id);assert.deepEqual(await instantanea(nuevo.id),antesGuardado);
  await http('POST','/api/documentos',dir,body(informe,'No permitido',fuente.id),403);
  await http('POST','/api/documentos',sec,body(informe,'No permitido',personal.id),404);
  await http('POST','/api/documentos',sec,body(informe,'No permitido',propioDir.id),404);
  await http('POST','/api/documentos',sec,body(informe,'No permitido','9223372036854775806'),404);
  const protegido=(await c.query('SELECT id::text FROM tipos_documentales WHERE requiere_clave LIMIT 1')).rows[0];
  await http('POST','/api/documentos',sec,body(protegido.id,'Tipo restringido',fuente.id),400);
  await http('POST','/api/siseve/operaciones',sec,{operacion:'listar',clave:'Incorrecta de verificación',datos:{}},403);
  // Fallo después de insertar documento: trigger acotado exclusivamente al asunto de esta prueba.
  await c.query(`CREATE FUNCTION public.fn_fallo_relacion_verificacion() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN IF EXISTS(SELECT 1 FROM documentos WHERE id=NEW.documento_id AND asunto='${marca} ROLLBACK') THEN RAISE EXCEPTION 'Fallo de relación de verificación' USING ERRCODE='23514'; END IF;RETURN NEW;END;$f$`);
  await c.query('CREATE TRIGGER zz_fallo_relacion_verificacion BEFORE INSERT ON documentos_relaciones FOR EACH ROW EXECUTE FUNCTION fn_fallo_relacion_verificacion()');trigger=true;
  async function integridad(){return {
   docs:(await c.query('SELECT count(*)::int n FROM documentos')).rows,
   relaciones:(await c.query('SELECT count(*)::int n FROM documentos_relaciones')).rows,
   historia:(await c.query('SELECT count(*)::int n FROM historial_modificaciones')).rows,
   entregas:(await c.query('SELECT count(*)::int n FROM entregas_secretaria_historial')).rows,
   codigos:(await c.query('SELECT to_jsonb(c) fila FROM correlativos_documentales c ORDER BY tipo_documental_id,anio')).rows
  };}
  const integridadAntes=await integridad();
  await http('POST','/api/documentos',sec,body(informe,marca+' ROLLBACK',fuente.id),400);
  assert.deepEqual(await integridad(),integridadAntes);assert.deepEqual(await instantanea(fuente.id),antes);
  await c.query('DROP TRIGGER zz_fallo_relacion_verificacion ON documentos_relaciones');await c.query('DROP FUNCTION public.fn_fallo_relacion_verificacion()');trigger=false;
  await http('POST',`/api/documentos/${siguiente.id}/anular`,sec,{motivo:'Verificación de conservación de relación histórica'});
  const anulado=(await http('GET','/api/documentos/'+siguiente.id,dir)).documento;assert.equal(anulado.activo,false);assert.equal(anulado.documento_origen.id,nuevo.id);
  assert.ok((await http('GET','/api/documentos/'+nuevo.id,sec)).documento.documentos_relacionados.some(d=>d.id===siguiente.id));
  console.log({identidad,baseHTTP:base,solicitudes,creados,origenConservadoExactamente:true,rollbackDocumentoRelacionAuditoriaCorrelativo:true});
  fs.mkdirSync('.private/local',{recursive:true});fs.writeFileSync('.private/local/relacionados.json',JSON.stringify({creados,fuente:fuente.id,nuevo:nuevo.id,siguiente:siguiente.id,registroDireccion:propioDir.id,personal:personal.id,solicitudes},null,2));
 }finally{
  if(trigger){await c.query('DROP TRIGGER IF EXISTS zz_fallo_relacion_verificacion ON documentos_relaciones');await c.query('DROP FUNCTION IF EXISTS public.fn_fallo_relacion_verificacion()');}
  await c.end();
 }
});
