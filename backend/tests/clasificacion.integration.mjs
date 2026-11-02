import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {test} from 'node:test';
import {parse} from 'dotenv';
import {abrirCopia,verificarCopia} from '../scripts/clasificacion-dev.mjs';

assert.equal(process.env.CLASIFICACION_DEV_AUTORIZADA,'PROBAR_COPIA_RECUPERADA');
test('Clasificación y privacidad: HTTP y PostgreSQL en copia recuperada',async t=>{
 const {cliente:owner,manifest}=await abrirCopia(true);
 const {cliente:c,url}=await abrirCopia();
 const externo=process.env.CLASIFICACION_HTTP_BASE;
 if(externo)assert.equal(externo,'http://localhost:5173','Solo se permite el proxy Vite local');
 const secret=externo?parse(fs.readFileSync('.env')).JWT_SECRET:randomBytes(48).toString('hex');
 Object.assign(process.env,{DATABASE_URL:url.toString(),DB_PROFILE:'local',NODE_ENV:'test',RENDER:'false',DOTENV_CONFIG_PATH:'.private/no-cargar-env',JWT_SECRET:secret,CORS_ORIGINS:'',TRUST_PROXY_HOPS:'0'});
 const {app}=await import('../src/app.ts');const {pool}=await import('../src/config/database.ts');
 const {generarHash}=await import('../src/shared/security/password.ts');
 const {generarToken}=await import('../src/shared/security/jwt.ts');
 const {detalleDocumentoSchema,listaDocumentosSchema,opcionesSchema}=await import('../../frontend/src/features/documentos/schemas/documentos.schema.ts');
 const {dashboardSchema}=await import('../../frontend/src/features/dashboard/schemas/dashboard.schema.ts');
 const server=externo?null:await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base=externo??('http://127.0.0.1:'+server.address().port);
 assert.equal((await fetch(base+'/api/health')).status,200);
 let requests=0;const tokens={},f={},docs={};
 const suffix=randomBytes(5).toString('hex'),password='QA-Clasificacion-2026!';
 async function http(method,ruta,key,body,status=200){
  await verificarCopia(c,manifest,'sistema_web_app');requests++;
  const r=await fetch(base+ruta,{method,headers:{...(key?{Authorization:'Bearer '+tokens[key]}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const value=await r.json();assert.equal(r.status,status,`${method} ${ruta}: ${value.error??r.status}`);
  if(status===200||status===201){
   if(ruta==='/api/dashboard')dashboardSchema.parse(value);
   else if(ruta==='/api/documentos/opciones')opcionesSchema.parse(value);
   else if(method==='GET'&&ruta.startsWith('/api/documentos?'))listaDocumentosSchema.parse(value);
   else if(value.documento)detalleDocumentoSchema.parse(value);
  }
  return value;
 }
 async function tx(actor,fn){await c.query('BEGIN');try{await c.query("SELECT pg_advisory_xact_lock(hashtext('administracion-institucional'));" );await c.query("SELECT set_config('app.usuario_actor_id',$1,true),set_config('app.motivo_documental','Comprobación aislada de clasificación',true)",[actor]);const result=await fn(c);await c.query('ROLLBACK');return result;}catch(e){await c.query('ROLLBACK');throw e;}}
 const originales=(await owner.query('SELECT id::text,to_jsonb(d) fila FROM documentos d WHERE clasificacion_registro IS NULL ORDER BY id')).rows;
 const previosOrdinarios=(await owner.query("SELECT d.id::text,d.responsable_actual_id::text, r.nombre autor_rol FROM documentos d JOIN usuarios u ON u.id=d.registrado_por_id JOIN roles r ON r.id=u.rol_id JOIN tipos_documentales td ON td.id=d.tipo_documental_id WHERE NOT td.requiere_clave AND lower(btrim(td.nombre))<>'síseve'")).rows;
 const origenIds=originales.map(d=>d.id);
 try{
  const pc=await pool.connect();try{await verificarCopia(pc,manifest,'sistema_web_app');}finally{pc.release();}
  assert.ok(originales.every(d=>d.fila.clasificacion_registro===null));
  await owner.query('BEGIN');
  const actor=(await owner.query("SELECT u.id::text FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE r.nombre='Administrador' AND u.activo ORDER BY u.id LIMIT 1")).rows[0].id;
  await owner.query("SELECT set_config('app.usuario_actor_id',$1,true),set_config('app.motivo_documental','Fixtures exclusivas de desarrollo',true)",[actor]);
  const roles=Object.fromEntries((await owner.query('SELECT id::text,nombre FROM roles')).rows.map(r=>[r.nombre,r.id]));
  const oficinas=Object.fromEntries((await owner.query('SELECT id::text,nombre FROM oficinas')).rows.map(r=>[r.nombre,r.id]));
  const office=(await owner.query('INSERT INTO oficinas(nombre) VALUES($1) RETURNING id::text',['Desarrollo clasificación '+suffix])).rows[0].id;
  const hash=await generarHash(password);
  for(const [key,rol,oficina] of [['admin','Administrador',null],['usuario','Usuario',office],['otro','Usuario',office],['secretaria','Secretaria de Dirección',oficinas['Mesa de Partes']],['secretaria2','Secretaria de Dirección',oficinas['Mesa de Partes']],['directora','Director(a)',oficinas['Dirección']],['directora2','Director(a)',oficinas['Dirección']]]){
   f[key]=(await owner.query("INSERT INTO usuarios(nombre,apellido,nombre_usuario,contrasena_hash,rol_id,oficina_id,activo) VALUES('Desarrollo',$1,$2,$3,$4,$5,true) RETURNING id::text,nombre_usuario,oficina_id::text",[key,'clasif_'+key+'_'+suffix,hash,roles[rol],oficina])).rows[0];
  }
  await owner.query('COMMIT');
  await owner.query('BEGIN');await owner.query("SELECT set_config('app.usuario_actor_id',$1,true),set_config('app.motivo_documental','Ubicación propia de prueba aislada',true)",[f.usuario.id]);
  const estante=(await owner.query('INSERT INTO estantes(codigo,usuario_id,oficina_id) VALUES($1,$2,$3) RETURNING id::text',['CQA'+suffix.slice(0,7).replace(/[0-9]/g,v=>String.fromCharCode(65+Number(v))).toUpperCase(),f.usuario.id,office])).rows[0].id;
  f.archivador=(await owner.query('INSERT INTO archivadores(estante_id,numero) VALUES($1,1) RETURNING id::text',[estante])).rows[0].id;await owner.query('COMMIT');
  const tipo=(await owner.query("SELECT id::text,prefijo_codigo FROM tipos_documentales WHERE NOT requiere_clave AND prefijo_codigo IS NOT NULL ORDER BY id LIMIT 1")).rows[0];
  for(const key of Object.keys(f).filter(k=>k!=='archivador'))tokens[key]=(await http('POST','/api/auth/login',null,{identificador:f[key].nombre_usuario,contrasena:password})).token;
  const body=clasificacion=>({tipo_documental_id:tipo.id,asunto:'Registro de clasificación '+suffix,remitente:null,observaciones:null,archivador_id:null,clasificacion_registro:clasificacion});
  await t.test('Recibido y emitido con Usuario, Secretaría y Dirección conservan clasificación, autoría, código y ubicación',async()=>{
   for(const key of ['usuario','secretaria','directora','otro','secretaria2','directora2']){
    docs[key]=[];
    for(const clasificacion of ['RECIBIDO','EMITIDO']){
     const input={...body(clasificacion),...(key==='usuario'?{archivador_id:f.archivador}:{})};
     const d=(await http('POST','/api/documentos',key,input,201)).documento;docs[key].push(d);
     assert.equal(d.clasificacion_registro,clasificacion);assert.equal(d.registrado_por_id,f[key].id);assert.equal(d.responsable_actual_id,f[key].id);assert.equal(d.oficina_responsable_id,f[key].oficina_id);assert.equal(d.archivador_id,input.archivador_id);
     assert.ok(d.codigo.startsWith(tipo.prefijo_codigo+new Date().getFullYear()));
     assert.equal(d.estado_tramite,key.startsWith('secretaria')?'PENDIENTE_DECISION':'RECIBIDO');
     const sql=(await c.query('SELECT clasificacion_registro,codigo,registrado_por_id::text,archivador_id::text FROM documentos WHERE id=$1',[d.id])).rows[0];assert.equal(sql.clasificacion_registro,clasificacion);assert.equal(sql.codigo,d.codigo);assert.equal(sql.registrado_por_id,f[key].id);assert.equal(sql.archivador_id,input.archivador_id);
     const recargado=(await http('GET','/api/documentos/'+d.id,key)).documento;assert.equal(recargado.clasificacion_registro,clasificacion);assert.equal(recargado.codigo,d.codigo);
    }
   }
  });
  await t.test('HTTP exige clasificación exacta y rechaza perfiles administrativos sin consumir un código',async()=>{
   const antes=(await c.query('SELECT to_jsonb(c) fila FROM correlativos_documentales c ORDER BY tipo_documental_id,anio')).rows;
   const {clasificacion_registro:ignorada,...sin}=body('RECIBIDO');void ignorada;
   for(const invalido of [sin,{...sin,clasificacion_registro:null},{...sin,clasificacion_registro:'recibido'},{...sin,clasificacion_registro:'EN_TRASLADO'}])await http('POST','/api/documentos','usuario',invalido,400);
   await http('POST','/api/documentos','admin',body('EMITIDO'),403);
   assert.deepEqual((await c.query('SELECT to_jsonb(c) fila FROM correlativos_documentales c ORDER BY tipo_documental_id,anio')).rows,antes);
  });
  await t.test('SQL exige clasificación en INSERT y evita reclasificar mediante correcciones',async()=>{
   for(const value of [null,'INVALIDA'])await assert.rejects(tx(f.usuario.id,q=>q.query("INSERT INTO documentos(tipo_documental_id,asunto,registrado_por_id,responsable_actual_id,oficina_responsable_id,estado_tramite,clasificacion_registro) VALUES($1,'SQL de prueba',$2,$2,$3,'RECIBIDO',$4)",[tipo.id,f.usuario.id,office,value])),{code:'23514'});
   await assert.rejects(tx(f.usuario.id,q=>q.query("UPDATE documentos SET clasificacion_registro='EMITIDO' WHERE id=$1",[docs.usuario[0].id])),{code:'23514'});
   await http('PUT','/api/documentos/'+docs.usuario[0].id,'usuario',{asunto:'Corrección propia',remitente:null,observaciones:null,motivo:'Corrección de desarrollo',clasificacion_registro:'EMITIDO'},400);
  });
  await t.test('Autoría filtra antes de página, total, detalle, historial, opciones y Dashboard',async()=>{
   for(const key of ['usuario','otro','secretaria','secretaria2','directora','directora2','admin']){
    const keys=key==='admin'?[]:key.startsWith('directora')?[key,'secretaria','secretaria2']:[key];const previos=key.startsWith('directora')?previosOrdinarios.filter(d=>d.autor_rol==='Secretaria de Dirección'):[];
    const esperados=[...keys.flatMap(k=>docs[k].map(d=>d.id)),...previos.map(d=>d.id)];
    const lista=await http('GET','/api/documentos?limite=100',key);assert.deepEqual(lista.documentos.map(d=>d.id).sort(),esperados.sort());assert.equal(lista.total,esperados.length);
    const corta=await http('GET','/api/documentos?limite=1&pagina=1',key);assert.equal(corta.total,esperados.length);assert.ok(corta.documentos.length<=1);
    for(const dueno of ['usuario','otro','secretaria','secretaria2','directora','directora2']){
     const status=keys.includes(dueno)?200:404;await http('GET','/api/documentos/'+docs[dueno][0].id,key,null,status);await http('GET','/api/documentos/'+docs[dueno][0].id+'/historial',key,null,status);
    }
    const opciones=await http('GET','/api/documentos/opciones',key);const responsables=new Set([...keys.map(k=>f[k].id),...previos.map(d=>d.responsable_actual_id)]);assert.ok(opciones.filtros.every(x=>responsables.has(x.responsable_id)));assert.equal(opciones.puede_registrar,key!=='admin');
    const dash=await http('GET','/api/dashboard',key);if(key==='admin'){assert.deepEqual(dash.recientes,[]);assert.deepEqual(dash.estados,[]);}else{assert.equal(dash.indicadores.find(i=>i.clave==='documentos').total,esperados.length);assert.equal(dash.estados.reduce((n,s)=>n+s.total,0),esperados.length);assert.ok(dash.recientes.every(d=>esperados.includes(d.id)));}
   }
  });
  await t.test('Dirección consulta Secretaría sin obtener edición o anulación',async()=>{
   const d=(await http('GET','/api/documentos/'+docs.secretaria[0].id,'directora')).documento;assert.equal(d.permisos.editar,false);assert.equal(d.permisos.anular,false);
   await http('PUT','/api/documentos/'+d.id,'directora',{asunto:'No permitido',remitente:null,observaciones:null,motivo:'Intento directo de prueba'},403);
   await http('POST','/api/documentos/'+d.id+'/anular','directora',{motivo:'Intento directo de prueba'},403);
   assert.equal((await http('GET','/api/documentos/'+d.id,'secretaria')).documento.asunto,d.asunto);
  });
  await t.test('Asignación y entrega: oficina, usuario, persona, permisos, filtros y concurrencia',async()=>{
   for(const clasificacion of ['RECIBIDO','EMITIDO'])for(const modo of ['OFICINA','USUARIO','PERSONA']){
    const d=(await http('POST','/api/documentos','secretaria',body(clasificacion),201)).documento;
    assert.equal(d.entrega.situacion,'PENDIENTE_ASIGNACION');
    await http('POST',`/api/documentos/${d.id}/confirmar-entrega`,'secretaria',{revision:0},409);
    const asignacion={tipo:modo,oficina_id:modo==='OFICINA'?office:null,usuario_id:modo==='PERSONA'?null:f.usuario.id,nombre:modo==='PERSONA'?'Persona externa sin cuenta':null,revision:0};
    await http('POST',`/api/documentos/${d.id}/asignar-destinatario`,'secretaria',asignacion,403);
    await http('POST',`/api/documentos/${d.id}/asignar-destinatario`,'admin',asignacion,404);
    await http('POST',`/api/documentos/${d.id}/asignar-destinatario`,'directora',{...asignacion,tipo:'OFICINA',oficina_id:oficinas['Dirección'],usuario_id:f.usuario.id,nombre:null},400);
    const asignado=(await http('POST',`/api/documentos/${d.id}/asignar-destinatario`,'directora',asignacion)).documento;
    assert.equal(asignado.entrega.situacion,'PENDIENTE_ENTREGA');assert.ok(asignado.entrega.destinatario);assert.equal(asignado.responsable_actual_id,f.secretaria.id);
    await http('GET',`/api/documentos/${d.id}`,'usuario',null,404);
    await http('POST',`/api/documentos/${d.id}/confirmar-entrega`,'directora',{revision:1},403);
    await http('POST',`/api/documentos/${d.id}/confirmar-entrega`,'secretaria2',{revision:1},404);
    const pendientes=await http('GET','/api/documentos?situacion=PENDIENTE_ENTREGA&limite=100','secretaria');assert.ok(pendientes.documentos.some(x=>x.id===d.id));
    const resultados=await Promise.all([fetch(base+`/api/documentos/${d.id}/confirmar-entrega`,{method:'POST',headers:{Authorization:'Bearer '+tokens.secretaria,'Content-Type':'application/json'},body:JSON.stringify({revision:1})}),fetch(base+`/api/documentos/${d.id}/asignar-destinatario`,{method:'POST',headers:{Authorization:'Bearer '+tokens.directora,'Content-Type':'application/json'},body:JSON.stringify({...asignacion,revision:1})})]);
    assert.deepEqual(resultados.map(r=>r.status).sort(),[200,409]);
    let final=(await http('GET',`/api/documentos/${d.id}`,'secretaria')).documento;
    if(final.entrega.situacion!=='ENTREGADO')final=(await http('POST',`/api/documentos/${d.id}/confirmar-entrega`,'secretaria',{revision:final.entrega.revision})).documento;
    assert.equal(final.entrega.situacion,'ENTREGADO');assert.equal(final.clasificacion_registro,clasificacion);assert.equal(final.registrado_por_id,f.secretaria.id);assert.equal(final.responsable_actual_id,d.responsable_actual_id);assert.equal(final.archivador_id,d.archivador_id);
    await http('POST',`/api/documentos/${d.id}/confirmar-entrega`,'secretaria',{revision:final.entrega.revision},409);
    await http('POST',`/api/documentos/${d.id}/asignar-destinatario`,'directora',{...asignacion,revision:final.entrega.revision},409);
    const h=(await http('GET',`/api/documentos/${d.id}/historial`,'directora')).historial;assert.ok(h.some(e=>e.accion==='Asignación'));assert.equal(h.filter(e=>e.accion==='Entrega confirmada').length,1);
    assert.equal((await c.query('SELECT count(*)::int n FROM movimientos_documentales WHERE documento_id=$1',[d.id])).rows[0].n,0);
   }
  });
  await t.test('Oficina sin usuario y dos confirmaciones simultáneas',async()=>{
   const d=(await http('POST','/api/documentos','secretaria',body('EMITIDO'),201)).documento;
   await http('POST',`/api/documentos/${d.id}/asignar-destinatario`,'directora',{tipo:'OFICINA',oficina_id:office,usuario_id:null,nombre:null,revision:0});
   const respuestas=await Promise.all([1,2].map(()=>fetch(base+`/api/documentos/${d.id}/confirmar-entrega`,{method:'POST',headers:{Authorization:'Bearer '+tokens.secretaria,'Content-Type':'application/json'},body:JSON.stringify({revision:1})})));
   assert.deepEqual(respuestas.map(r=>r.status).sort(),[200,409]);
   assert.equal((await c.query("SELECT count(*)::int n FROM entregas_secretaria_historial WHERE documento_id=$1 AND evento='Entrega confirmada'",[d.id])).rows[0].n,1);
  });
  await t.test('La custodia por sí sola no concede edición de registros de Secretaría ni cambia la clasificación',async()=>{
   // Solo prepara una situación heredada en QA con el circuito ya existente;
   // no agrega operaciones ni permisos al producto de esta fase.
   const id=docs.secretaria[1].id;
   // Emula un antecedente anterior a la segunda migración, solo sobre esta fixture nueva.
   await owner.query('DELETE FROM entregas_secretaria_historial WHERE documento_id=$1',[id]);
   await owner.query('DELETE FROM entregas_secretaria WHERE documento_id=$1',[id]);
   await http('POST','/api/documentos/'+id+'/autorizar','directora',{usuario_destino_id:f.directora.id,motivo:'Fixture de custodia aislada'});
   const m=(await http('POST','/api/movimientos','secretaria',{documento_id:id,usuario_destino_id:f.directora.id,motivo:'Fixture de entrega heredada'},201)).movimiento;
   await http('POST','/api/movimientos/'+m.id+'/recibir','directora',{archivador_id:null});
   const d=(await http('GET','/api/documentos/'+id,'directora')).documento;
   assert.equal(d.responsable_actual_id,f.directora.id);assert.equal(d.registrado_por_id,f.secretaria.id);
   assert.equal(d.clasificacion_registro,'EMITIDO');assert.equal(d.estado_tramite,'RECIBIDO');
   assert.equal(d.permisos.editar,false);assert.equal(d.permisos.anular,false);
   await http('PUT','/api/documentos/'+id,'directora',{asunto:'No permitido por custodia',remitente:null,observaciones:null,motivo:'Intento de prueba'},403);
  });
  await t.test('Antecedentes conservan sus filas y permanecen sin clasificación',async()=>{
   const legados=(await owner.query('SELECT id::text,to_jsonb(d) fila FROM documentos d WHERE id=ANY($1::bigint[]) ORDER BY id',[origenIds])).rows;assert.deepEqual(legados,originales);
   const legado=(await owner.query("SELECT d.id::text,u.id::text autor,u.version_autenticacion FROM documentos d JOIN usuarios u ON u.id=d.registrado_por_id JOIN roles r ON r.id=u.rol_id JOIN tipos_documentales t ON t.id=d.tipo_documental_id WHERE u.activo AND r.nombre IN ('Usuario','Secretaria de Dirección','Director(a)') AND NOT t.requiere_clave AND d.id=ANY($1::bigint[]) LIMIT 1",[origenIds])).rows[0];
   if(legado){tokens.legado=generarToken(legado.autor,legado.version_autenticacion);assert.equal((await http('GET','/api/documentos/'+legado.id,'legado')).documento.clasificacion_registro,null);}
  });
  await t.test('SíseVe mantiene autorización individual y clave; clasifica nuevos sin filtrar datos al circuito ordinario',async()=>{
   const clave='Clave exclusiva desarrollo '+suffix;const protegido=(await owner.query("SELECT id::text FROM tipos_documentales WHERE nombre='SíseVe' AND requiere_clave")).rows[0].id;
   await http('PUT','/api/siseve/clave','admin',{contrasena:clave});await http('PUT','/api/siseve/autorizaciones','admin',{usuario_id:f.usuario.id,activo:true});await http('PUT','/api/siseve/autorizaciones','admin',{usuario_id:f.directora.id,activo:true});
   const datos={...body('EMITIDO'),tipo_documental_id:protegido};
   await http('POST','/api/siseve/operaciones','otro',{operacion:'listar',clave,datos:{}},403);await http('POST','/api/siseve/operaciones','directora',{operacion:'listar',clave:'Incorrecta',datos:{}},403);
   const p=(await http('POST','/api/siseve/operaciones','usuario',{operacion:'registrar',clave,datos})).resultado.documento;assert.equal(p.clasificacion_registro,'EMITIDO');
   await http('GET','/api/documentos/'+p.id,'usuario',null,404);await http('GET','/api/documentos/'+p.id,'directora',null,404);
   const listado=(await http('POST','/api/siseve/operaciones','directora',{operacion:'listar',clave,datos:{}})).resultado;assert.ok(listado.documentos.some(d=>d.id===p.id));
   for(const key of ['usuario','directora']){assert.ok(!(await http('GET','/api/documentos?limite=100',key)).documentos.some(d=>d.id===p.id));const dashboard=await http('GET','/api/dashboard',key);assert.ok(!dashboard.recientes.some(d=>d.id===p.id));}
  });
  fs.writeFileSync('.private/clasificacion-dev/fixtures.json',JSON.stringify({perfiles:f,password,docs,base:manifest.nombre}),{mode:0o600});
  console.log({destinoHTTP:base,solicitudesHTTP:requests,rolEfectivo:'sistema_web_app',base:manifest.nombre});
 }finally{await owner.query('ROLLBACK').catch(()=>{});if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await c.end();await owner.end();}
});
