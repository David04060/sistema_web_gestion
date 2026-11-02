import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes} from 'node:crypto';
import {app} from '../dist/app.js';
import {pool} from '../dist/config/database.js';
import {generarToken} from '../dist/shared/security/jwt.js';
import {datosAuditoria} from '../dist/modules/documentos/auditoria.documental.js';

test('Auditoría normalizada: datos reales legibles, sin identificadores ni claves privadas',()=>{
 assert.deepEqual(datosAuditoria({asunto:null},{asunto:''}),[]);
 assert.deepEqual(datosAuditoria(null,{nombre:'Archivo.pdf',tamano_bytes:123,clave_r2:'privado',documento_id:1,revision:'interna'}),[{campo:'Nombre del PDF',anterior:null,posterior:'Archivo.pdf'},{campo:'Tamaño del PDF (bytes)',anterior:null,posterior:'123'}]);
 assert.deepEqual(datosAuditoria({valor:'Antes',nombre_guardado:'Etiqueta histórica'},{valor:'Después',nombre_guardado:'Etiqueta histórica'}),[{campo:'Etiqueta histórica',anterior:'Antes',posterior:'Después'}]);
});

test('Mejoras locales por HTTP y PostgreSQL real: fixtures revertidos íntegramente',async t=>{
 const identidad=(await pool.query("SELECT current_database() base,inet_server_addr()::text host,(SELECT oid::text FROM pg_database WHERE datname=current_database()) oid")).rows[0];assert.equal(identidad.base,'sistema_web_documental_final');assert.equal(identidad.oid,'98367');assert.ok(['::1/128','127.0.0.1/32'].includes(identidad.host));
 const conectar=pool.connect.bind(pool),consultar=pool.query.bind(pool),c=await conectar();
 const tablas=(await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(t=>t.tablename);
 async function huellas(){const out={};for(const tabla of tablas){assert.match(tabla,/^[a-z_]+$/);out[tabla]=(await c.query(`SELECT count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) hash FROM public.${tabla} t`)).rows[0];}return out;}
 const antes=await huellas();await c.query('BEGIN');
 // Se ejecutan las consultas y triggers reales. Cada operación conserva su
 // savepoint; la transacción exterior revierte todos los fixtures al finalizar.
 pool.query=(sql,...args)=>c.query(sql,...args);
 pool.connect=async()=>({query:(sql,...args)=>c.query(sql==='BEGIN'?'SAVEPOINT operacion_http':sql==='COMMIT'?'RELEASE SAVEPOINT operacion_http':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT operacion_http':sql,...args),release:()=>{}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api';
 const existentes=(await c.query('SELECT id::text,rol_id FROM usuarios WHERE activo ORDER BY id')).rows;
 const porRol=rol=>existentes.find(u=>u.rol_id===rol).id;
 async function pedir(actor,ruta,method='GET',body){const u=(await c.query('SELECT version_autenticacion FROM usuarios WHERE id=$1',[actor])).rows[0];const r=await fetch(base+ruta,{method,headers:{Authorization:'Bearer '+generarToken(actor,u.version_autenticacion),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
 let oficina,usuario,documento,campo,unidad,lugar;
 const razon='Verificación local con rollback';
 try{
  const admin=porRol(2),director=porRol(3),secretaria=porRol(4),superadmin=porRol(1);
  const institucionales=(await c.query("SELECT id::text,nombre FROM oficinas WHERE nombre IN('Dirección','Mesa de Partes')")).rows;
  const nombreCuenta='prueba_mejoras_'+randomBytes(4).toString('hex');
  const alta={nombre:'PRUEBA LOCAL',apellido:'Mejoras',nombre_usuario:nombreCuenta,rol_id:5,contrasena:randomBytes(20).toString('hex')};
  await t.test('Usuario no puede asignarse a oficinas institucionales en alta, edición ni SQL directo',async()=>{
   for(const o of institucionales)assert.equal((await pedir(admin,'/usuarios','POST',{...alta,oficina_id:o.id})).status,400);
   const r=await pedir(admin,'/oficinas','POST',{nombre:'PRUEBA LOCAL — lugar y contenido'});assert.equal(r.status,201);oficina=r.body.id;
   const u=await pedir(admin,'/usuarios','POST',{...alta,oficina_id:oficina});assert.equal(u.status,201);usuario=u.body.id;
   const perfil=(await pedir(admin,'/usuarios/'+usuario)).body.usuario;
   const datos={nombre:perfil.nombre,apellido:perfil.apellido,nombre_usuario:perfil.nombre_usuario,email:perfil.email,telefono:perfil.telefono,rol_id:5,motivo:razon};
   for(const o of institucionales){assert.equal((await pedir(admin,'/usuarios/'+usuario,'PUT',{...datos,oficina_id:o.id})).status,400);await c.query('SAVEPOINT sql_invalido');await assert.rejects(c.query('UPDATE usuarios SET oficina_id=$2 WHERE id=$1',[usuario,o.id]),e=>e.code==='P0001');await c.query('ROLLBACK TO SAVEPOINT sql_invalido');}
   assert.equal((await pedir(admin,'/usuarios/'+usuario,'PUT',{...datos,nombre:'PRUEBA LOCAL editada',oficina_id:oficina})).status,200);
   assert.equal((await pedir(admin,'/usuarios/'+usuario,'PUT',{...datos,rol_id:3,oficina_id:oficina})).status,400);
  });
  await t.test('Oficinas: edición separada, detalle y actividad con motivo sin romper asignaciones',async()=>{
   assert.equal((await pedir(admin,'/oficinas/'+oficina,'PUT',{nombre:'PRUEBA LOCAL oficina editada',motivo:razon})).status,200);
   let r=await pedir(admin,'/oficinas/'+oficina);assert.equal(r.status,200);assert.equal(r.body.oficina.nombre,'PRUEBA LOCAL oficina editada');assert.equal(r.body.oficina.activa,true);
   assert.equal((await pedir(admin,'/oficinas/'+oficina+'/actividad','POST',{activa:false,motivo:razon})).status,200);
   assert.equal((await pedir(admin,'/oficinas/'+oficina,'PUT',{nombre:'PRUEBA LOCAL oficina inactiva',motivo:razon})).status,200);
   r=await pedir(admin,'/oficinas/'+oficina);assert.equal(r.body.oficina.activa,false);
   assert.equal((await c.query('SELECT oficina_id::text FROM usuarios WHERE id=$1',[usuario])).rows[0].oficina_id,oficina);
   assert.equal((await pedir(admin,'/oficinas/'+oficina+'/actividad','POST',{activa:true,motivo:razon})).status,200);
   assert.equal((await pedir(admin,'/oficinas/'+oficina+'/actividad','POST',{activa:false})).status,400);
   assert.equal((await pedir(director,'/oficinas/'+oficina+'/actividad','POST',{activa:false,motivo:razon})).status,403);
   assert.equal((await pedir(admin,'/oficinas/'+oficina,'PUT',{nombre:'No mezclar acciones',activa:false,motivo:razon})).status,400);
   for(const o of institucionales){assert.equal((await pedir(admin,'/oficinas/'+o.id+'/actividad','POST',{activa:false,motivo:razon})).status,409);assert.equal((await pedir(admin,'/oficinas/'+o.id,'PUT',{nombre:'No permitido',motivo:razon})).status,409);}
   const eventos=(await c.query("SELECT accion,motivo,actor_id::text FROM auditoria_configuracion WHERE entidad='OFICINA' AND entidad_id=$1 AND accion IN('ACTIVAR','DESACTIVAR') ORDER BY id",[oficina])).rows;assert.deepEqual(eventos.map(e=>e.accion),['DESACTIVAR','ACTIVAR']);assert.ok(eventos.every(e=>e.motivo===razon&&e.actor_id===admin));
  });
  await t.test('Activación separada: motivo y auditoría, sin alterar datos personales; Superadministrador protegido',async()=>{
   const antes=(await c.query('SELECT * FROM usuarios WHERE id=$1',[usuario])).rows[0];
   assert.equal((await pedir(admin,'/usuarios/'+usuario+'/actividad','POST',{activo:false})).status,400);
   assert.equal((await pedir(admin,'/usuarios/'+usuario+'/actividad','POST',{activo:false,motivo:razon})).status,200);
   const despues=(await c.query('SELECT * FROM usuarios WHERE id=$1',[usuario])).rows[0];assert.equal(despues.activo,false);
   for(const k of Object.keys(antes).filter(k=>!['activo','actualizada_en','version_autenticacion'].includes(k)))assert.deepEqual(despues[k],antes[k],k);
   assert.equal((await pedir(admin,'/usuarios/'+usuario+'/actividad','POST',{activo:true,motivo:razon})).status,200);
   const eventos=(await c.query("SELECT accion,actor_id::text,motivo FROM auditoria_configuracion WHERE entidad='USUARIO' AND entidad_id=$1 AND accion IN('ACTIVAR','DESACTIVAR') ORDER BY id",[usuario])).rows;assert.deepEqual(eventos.map(e=>e.accion),['DESACTIVAR','ACTIVAR']);assert.ok(eventos.every(e=>e.actor_id===admin&&e.motivo===razon));
   assert.equal((await pedir(superadmin,'/usuarios/'+superadmin+'/actividad','POST',{activo:false,motivo:razon})).status,409);
   assert.equal((await pedir(admin,'/usuarios/'+superadmin+'/actividad','POST',{activo:false,motivo:razon})).status,404);
   assert.equal((await pedir(director,'/usuarios/'+usuario+'/actividad','POST',{activo:false,motivo:razon})).status,403);
   assert.equal((await pedir(usuario,'/usuarios/'+usuario+'/actividad','POST',{activo:false,motivo:razon})).status,403);
  });
  await t.test('Campos configurables de Directora, Secretaría y Usuario, separados por cuenta',async()=>{
   for(const cuenta of [director,secretaria,usuario]){const r=await pedir(admin,'/campos-opcionales','POST',{usuario_id:cuenta,nombre:'Referencia PRUEBA LOCAL'});assert.equal(r.status,201);const opciones=await pedir(cuenta,'/documentos/opciones');assert.equal(opciones.status,200);assert.ok(opciones.body.campos.some(v=>v.id===r.body.id));if(cuenta===usuario)campo=r.body.id;else{const doc=await pedir(cuenta,'/documentos','POST',{tipo_id:opciones.body.tipos[0].id,clasificacion:'RECIBIDO',asunto:'[PRUEBA LOCAL MEJORAS] Campos por cuenta',valores:[{campo_id:r.body.id,valor:'Valor de prueba'}]});assert.equal(doc.status,201);assert.equal(doc.body.documento.valores[0].nombre_guardado,'Referencia PRUEBA LOCAL');}}
  });
  await t.test('Crear lugar y contenido propio; rechazar padre ajeno y ciclos; ruta documental legible',async()=>{
   const r=await pedir(usuario,'/ubicaciones','POST',{clase:'Lugar',nombre:'Estante PRUEBA LOCAL',padre_id:null});assert.equal(r.status,201);lugar=r.body.id;
   const hijo=await pedir(usuario,'/ubicaciones','POST',{clase:'Archivador',nombre:'Informes de marzo',padre_id:lugar});assert.equal(hijo.status,201);unidad=hijo.body.id;
   const ajeno=await pedir(director,'/ubicaciones','POST',{clase:'Lugar',nombre:'Lugar ajeno PRUEBA LOCAL',padre_id:null});assert.equal(ajeno.status,201);
   assert.equal((await pedir(usuario,'/ubicaciones','POST',{clase:'Portafolio',nombre:'No válido',padre_id:ajeno.body.id})).status,409);
   assert.equal((await pedir(usuario,'/ubicaciones/'+lugar,'PUT',{clase:'Lugar',nombre:'Estante PRUEBA LOCAL',padre_id:unidad})).status,409);
   const tipo=await pedir(usuario,'/tipos-documentales','POST',{nombre:'PRUEBA LOCAL mejoras',prefijo:'MJL'});assert.equal(tipo.status,201);
   const doc=await pedir(usuario,'/documentos','POST',{tipo_id:tipo.body.id,clasificacion:'RECIBIDO',asunto:'[PRUEBA LOCAL MEJORAS] Ubicación y auditoría',unidad_id:lugar,valores:[{campo_id:campo,valor:'Valor histórico'}]});assert.equal(doc.status,201);documento=doc.body.documento.id;
   assert.equal(doc.body.documento.ubicacion.ruta_ubicacion_guardada,'Estante PRUEBA LOCAL');
   const ubicado=await pedir(usuario,'/documentos/'+documento+'/ubicacion','POST',{revision:doc.body.documento.revision,unidad_id:unidad});assert.equal(ubicado.status,200);assert.equal(ubicado.body.documento.ubicacion.ruta_ubicacion_guardada,'Estante PRUEBA LOCAL / Informes de marzo');
   const lista=await pedir(usuario,'/documentos');assert.ok(lista.body.documentos.some(d=>d.id===documento&&d.ubicacion_ruta==='Estante PRUEBA LOCAL / Informes de marzo'));
  });
  await t.test('Etiquetas históricas, resumen y auditoría completa mantienen permiso de lectura por API directa',async()=>{
   assert.equal((await pedir(admin,'/campos-opcionales/'+campo,'PUT',{nombre:'Referencia renombrada',motivo:razon})).status,200);
   const detalle=await pedir(usuario,'/documentos/'+documento);assert.equal(detalle.body.documento.valores[0].nombre_guardado,'Referencia PRUEBA LOCAL');
   const editado=await pedir(usuario,'/documentos/'+documento,'PUT',{revision:detalle.body.documento.revision,motivo:razon,asunto:'[PRUEBA LOCAL MEJORAS] Asunto corregido'});assert.equal(editado.status,200);
   const audit=await pedir(usuario,'/documentos/'+documento+'/auditoria');assert.equal(audit.status,200);assert.ok(audit.body.eventos.some(e=>e.accion==='CORRECCION'&&e.motivo===razon&&e.datos.some(d=>d.campo==='Asunto')));assert.ok(audit.body.eventos.some(e=>e.accion==='UBICACION'&&e.datos.some(d=>d.posterior==='Estante PRUEBA LOCAL / Informes de marzo')));
   assert.ok(audit.body.eventos.every(e=>e.actor));assert.ok(!JSON.stringify(audit.body.eventos).includes('clave_r2'));
   assert.equal((await pedir(admin,'/documentos/'+documento+'/auditoria')).status,404);
   assert.equal((await pedir(existentes.find(u=>u.rol_id===5).id,'/documentos/'+documento+'/auditoria')).status,404);
   assert.equal((await pedir(director,'/documentos/'+documento+'/auditoria')).status,200);
   const h=await pedir(usuario,'/documentos/'+documento+'/historial');assert.equal(audit.body.eventos.length,h.body.historial.length);
  });
 }finally{pool.connect=conectar;pool.query=consultar;await c.query('ROLLBACK');assert.deepEqual(await huellas(),antes,'Todos los fixtures deben revertirse');c.release();await new Promise(r=>server.close(r));await pool.end();}
});
