import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from 'dotenv';
import pg from 'pg';
import {test} from 'node:test';
import {verificarConexionLocal,validarUrlLocal} from '../src/config/local.ts';

// Verificación explícita del flujo local: conserva antecedentes y crea registros de comprobación.
test('Desarrollo local real por Vite: registro, privacidad, asignación, entrega y persistencia',async()=>{
 const local=parse(fs.readFileSync('.env'));
 const conexion=process.env.DATABASE_URL??local.DATABASE_URL;validarUrlLocal(conexion);
 const c=new pg.Client({connectionString:conexion});await c.connect();
 const base='http://localhost:5173';let peticiones=0;
 try {
  const identidad=await verificarConexionLocal(c,conexion);
  const anteriores=(await c.query('SELECT id::text,to_jsonb(d) fila FROM documentos d ORDER BY id')).rows;
  const historialAnterior=(await c.query('SELECT id::text,to_jsonb(h) fila FROM historial_modificaciones h ORDER BY id')).rows;
  const movimientosAnteriores=(await c.query('SELECT id::text,to_jsonb(m) fila FROM movimientos_documentales m ORDER BY id')).rows;
  const perfiles={};
  for(const rol of ['Secretaria de Dirección','Director(a)','Usuario','Administrador']){
   perfiles[rol]=(await c.query('SELECT u.id::text,u.oficina_id::text,u.version_autenticacion FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.activo AND r.nombre=$1 ORDER BY u.id LIMIT 1',[rol])).rows[0];assert.ok(perfiles[rol],`Falta perfil local: ${rol}`);
  }
  // Tokens de cuentas locales existentes con la firma habitual; no se crean cuentas ni se cambian contraseñas.
  const {generarToken}=await import('../src/shared/security/jwt.ts');
  const tokens=Object.fromEntries(Object.entries(perfiles).map(([rol,u])=>[rol,generarToken(u.id,u.version_autenticacion)]));
  const {detalleDocumentoSchema,listaDocumentosSchema,opcionesSchema}=await import('../../frontend/src/features/documentos/schemas/documentos.schema.ts');
  async function http(method,ruta,rol,body,status=200){
   await verificarConexionLocal(c,conexion);peticiones++;
   const r=await fetch(base+ruta,{method,headers:{Authorization:'Bearer '+tokens[rol],Origin:base,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
   const value=await r.json();assert.equal(r.status,status,`${method} ${ruta}: ${value.error??r.status}`);
   if(status<300){if(value.documento)detalleDocumentoSchema.parse(value);if(value.documentos)listaDocumentosSchema.parse(value);if(ruta==='/api/documentos/opciones')opcionesSchema.parse(value);}
   return value;
  }
  const secretaria='Secretaria de Dirección',direccion='Director(a)';
  const opciones=await http('GET','/api/documentos/opciones',secretaria);
  const tipo=opciones.tipos.find(t=>t.prefijo_codigo);assert.ok(tipo);
  const creados=[];
  for(const clasificacion of ['RECIBIDO','EMITIDO']){
   await verificarConexionLocal(c,conexion);
   const d=(await http('POST','/api/documentos',secretaria,{tipo_documental_id:tipo.id,asunto:`Verificación local de ${clasificacion.toLowerCase()} — ${new Date().toISOString()}`,remitente:null,observaciones:'Registro de comprobación creado localmente; sin datos importados de QA.',archivador_id:null,clasificacion_registro:clasificacion},201)).documento;creados.push(d.id);
   assert.equal(d.entrega.situacion,'PENDIENTE_DECISION');
   const asignacion=clasificacion==='RECIBIDO'?{oficina_id:perfiles.Usuario.oficina_id,usuario_id:perfiles.Usuario.id,nombre:null,observaciones:'Entregar a la oficina indicada',revision:0}:{oficina_id:perfiles.Usuario.oficina_id,usuario_id:null,nombre:'Destinatario de verificación local',observaciones:'Entregar a la persona indicada',revision:0};
   await http('POST',`/api/documentos/${d.id}/delegar`,direccion,{oficina_id:null,usuario_id:null,nombre:null,revision:0},400);
   await http('POST',`/api/documentos/${d.id}/delegar`,direccion,{...asignacion,oficina_id:perfiles[direccion].oficina_id,usuario_id:perfiles.Usuario.id,nombre:null},400);
   await http('POST',`/api/documentos/${d.id}/confirmar-entrega`,secretaria,{revision:0},409);
   await http('POST',`/api/documentos/${d.id}/asignar-destinatario`,secretaria,asignacion,403);
   const asignado=(await http('POST',`/api/documentos/${d.id}/asignar-destinatario`,direccion,asignacion)).documento;
   assert.equal(asignado.entrega.situacion,'DELEGADO');assert.equal(asignado.entrega.observaciones,asignacion.observaciones);
   const lista=await http('GET','/api/documentos?situacion=DELEGADO',secretaria);assert.ok(lista.documentos.some(x=>x.id===d.id));
   const entregado=(await http('POST',`/api/documentos/${d.id}/confirmar-entrega`,secretaria,{revision:1})).documento;
   assert.equal(entregado.entrega.situacion,'ENTREGADO');
   await http('POST',`/api/documentos/${d.id}/confirmar-entrega`,secretaria,{revision:2},409);
   await http('POST',`/api/documentos/${d.id}/asignar-destinatario`,direccion,{...asignacion,revision:2},409);
   const recargado=(await http('GET',`/api/documentos/${d.id}`,secretaria)).documento;
   assert.equal(recargado.clasificacion_registro,clasificacion);assert.deepEqual(recargado.entrega,entregado.entrega);
   const persistido=(await c.query('SELECT d.codigo,d.clasificacion_registro,f.situacion,f.destinatario FROM documentos d JOIN entregas_secretaria f ON f.documento_id=d.id WHERE d.id=$1',[d.id])).rows[0];assert.ok(persistido);assert.equal(persistido.codigo,d.codigo);assert.equal(persistido.clasificacion_registro,clasificacion);assert.equal(persistido.situacion,'ENTREGADO');assert.equal(persistido.destinatario,entregado.entrega.destinatario);
   assert.equal(recargado.registrado_por_id,d.registrado_por_id);assert.equal(recargado.responsable_actual_id,d.responsable_actual_id);assert.equal(recargado.archivador_id,d.archivador_id);
   assert.equal((await http('GET',`/api/documentos/${d.id}`,direccion)).documento.permisos.editar,false);
   for(const rol of ['Usuario','Administrador']){await http('GET',`/api/documentos/${d.id}`,rol,undefined,404);await http('GET',`/api/documentos/${d.id}/historial`,rol,undefined,404);}
   const h=(await http('GET',`/api/documentos/${d.id}/historial`,direccion)).historial;assert.ok(h.some(e=>e.accion==='Delegación'));assert.equal(h.filter(e=>e.accion==='Entrega confirmada').length,1);
  }
  // Reutiliza ubicaciones existentes; crea solo la mínima de Dirección si todavía no hay ninguna.
  let ubicacion=(await http('GET','/api/documentos/opciones',direccion)).ubicaciones_direccion[0];
  if(!ubicacion){
   const e=(await http('POST','/api/ubicaciones/estantes',direccion,{codigo:'DIRECCION',usuario_id:perfiles[direccion].id,oficina_id:perfiles[direccion].oficina_id},201)).estante;
   const a=(await http('POST','/api/ubicaciones/archivadores',direccion,{estante_id:e.id,numero:1},201)).archivador;
   ubicacion={id:a.id,estante_id:e.id};
  }
  async function registrarCaso(asunto){const d=(await http('POST','/api/documentos',secretaria,{tipo_documental_id:tipo.id,asunto,remitente:null,observaciones:null,archivador_id:null,clasificacion_registro:'RECIBIDO'},201)).documento;creados.push(d.id);return d;}
  const guardar=await registrarCaso('Verificación local: guardar en Dirección');
  const datosGuardar={estante_id:ubicacion.estante_id,archivador_id:ubicacion.id,revision:0};
  await http('POST',`/api/documentos/${guardar.id}/guardar-direccion`,secretaria,datosGuardar,403);
  const ajena=(await c.query('SELECT a.id::text,e.id::text estante FROM archivadores a JOIN estantes e ON e.id=a.estante_id WHERE e.oficina_id<>$1 LIMIT 1',[perfiles[direccion].oficina_id])).rows[0];
  if(ajena)await http('POST',`/api/documentos/${guardar.id}/guardar-direccion`,direccion,{estante_id:ajena.estante,archivador_id:ajena.id,revision:0},400);
  const guardado=(await http('POST',`/api/documentos/${guardar.id}/guardar-direccion`,direccion,datosGuardar)).documento;
  assert.equal(guardado.entrega.situacion,'GUARDADO_DIRECCION');assert.ok(guardado.entrega.ubicacion_direccion);
  assert.equal(guardado.registrado_por_id,guardar.registrado_por_id);assert.equal(guardado.archivador_id,guardar.archivador_id);
  const vista=(await http('GET',`/api/documentos/${guardar.id}`,secretaria)).documento;assert.equal(vista.entrega.situacion,'GUARDADO_DIRECCION');assert.equal(vista.permisos.confirmar_entrega,false);
  await http('POST',`/api/documentos/${guardar.id}/confirmar-entrega`,secretaria,{revision:1},409);
  await http('POST',`/api/documentos/${guardar.id}/delegar`,direccion,{oficina_id:null,usuario_id:null,nombre:'No permitido',revision:1},409);
  const hguardado=(await http('GET',`/api/documentos/${guardar.id}/historial`,direccion)).historial;assert.ok(hguardado.some(h=>h.accion==='Guardado en Dirección'&&h.campos_modificados['Ubicación']));
  for(const destino of [{oficina_id:perfiles.Usuario.oficina_id,usuario_id:null,nombre:null},{oficina_id:null,usuario_id:perfiles.Usuario.id,nombre:null},{oficina_id:null,usuario_id:null,nombre:'Persona manual'}]){
   const d=await registrarCaso('Verificación local: oficina o persona');
   const a=(await http('POST',`/api/documentos/${d.id}/delegar`,direccion,{...destino,revision:0})).documento;assert.equal(a.entrega.situacion,'DELEGADO');
   await http('POST',`/api/documentos/${d.id}/guardar-direccion`,direccion,{...datosGuardar,revision:1},409);
   await http('POST',`/api/documentos/${d.id}/confirmar-entrega`,secretaria,{revision:1});
  }
  const concurrente=await registrarCaso('Verificación local: decisiones concurrentes');
  const decisiones=await Promise.all([['guardar-direccion',datosGuardar],['delegar',{oficina_id:null,usuario_id:null,nombre:'Persona concurrente',revision:0}]].map(([ruta,body])=>fetch(base+`/api/documentos/${concurrente.id}/${ruta}`,{method:'POST',headers:{Authorization:'Bearer '+tokens[direccion],'Content-Type':'application/json'},body:JSON.stringify(body)})));
  assert.deepEqual(decisiones.map(r=>r.status).sort(),[200,409]);
  const final=(await http('GET',`/api/documentos/${concurrente.id}`,secretaria)).documento;
  if(final.entrega.situacion==='DELEGADO'){
   const dobles=await Promise.all([1,2].map(()=>fetch(base+`/api/documentos/${concurrente.id}/confirmar-entrega`,{method:'POST',headers:{Authorization:'Bearer '+tokens[secretaria],'Content-Type':'application/json'},body:JSON.stringify({revision:1})})));
   assert.deepEqual(dobles.map(r=>r.status).sort(),[200,409]);
  }
  await http('PUT',`/api/documentos/${guardar.id}`,direccion,{asunto:'No permitido',remitente:null,observaciones:null,motivo:'Comprobación de permisos'},403);
  await http('POST',`/api/documentos/${guardar.id}/anular`,direccion,{motivo:'Comprobación de permisos'},403);
  for(const rol of Object.keys(perfiles)){
   const lista=await http('GET','/api/documentos?limite=100',rol);
   if(rol==='Administrador')assert.equal(lista.total,0);
   if(rol==='Usuario')assert.ok(lista.documentos.every(d=>d.registrado_por_id===perfiles[rol].id));
   if(rol===secretaria)assert.ok(lista.documentos.every(d=>d.registrado_por_id===perfiles[rol].id||d.registrado_por_id===perfiles[direccion].id));
   await http('GET','/api/documentos/opciones',rol);
  }
  assert.deepEqual((await c.query('SELECT id::text,to_jsonb(d) fila FROM documentos d WHERE id=ANY($1::bigint[]) ORDER BY id',[anteriores.map(d=>d.id)])).rows,anteriores);
  assert.deepEqual((await c.query('SELECT id::text,to_jsonb(h) fila FROM historial_modificaciones h WHERE id=ANY($1::bigint[]) ORDER BY id',[historialAnterior.map(h=>h.id)])).rows,historialAnterior);
  assert.deepEqual((await c.query('SELECT id::text,to_jsonb(m) fila FROM movimientos_documentales m ORDER BY id')).rows,movimientosAnteriores);
  const resultado={fecha:new Date().toISOString(),identidad,baseHTTP:base,peticiones,registrosVerificacion:creados,anterioresConservados:anteriores.length,historialAnteriorConservado:historialAnterior.length,movimientosAnterioresConservados:movimientosAnteriores.length};
  fs.mkdirSync('.private/local',{recursive:true});fs.writeFileSync('.private/local/verificacion.json',JSON.stringify(resultado,null,2));console.log(resultado);
 }finally{await c.end();}
});
