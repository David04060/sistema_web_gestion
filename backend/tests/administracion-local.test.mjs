import './helpers/exigir-aislamiento.mjs';
import {verificarEntornoPrueba} from './helpers/entorno-prueba.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes} from 'node:crypto';
import {app} from '../dist/app.js';
import {pool} from '../dist/config/database.js';
import {generarToken} from '../dist/shared/security/jwt.js';
import {editarUsuario,editarOficina} from '../dist/modules/usuarios/administracion.operaciones.js';

test('API local real: Superadministrador protegido y edición autorizada con rollback',async t=>{
 await verificarEntornoPrueba(pool);
 const indice=(await pool.query("SELECT indisunique,indisvalid FROM pg_index WHERE indexrelid='public.ux_superadministrador_unico'::regclass")).rows[0];assert.ok(indice?.indisunique&&indice.indisvalid,'Debe conservarse el índice único del Superadministrador');
 const antes=(await pool.query('SELECT * FROM usuarios ORDER BY id')).rows;
 const superadmin=antes.find(u=>u.rol_id===1&&u.activo),admin=antes.find(u=>u.rol_id===2&&u.activo);
 assert.ok(superadmin&&admin,'El runner debe preparar las cuentas sintéticas de los cinco roles');
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;
 const tokens=new Map(antes.filter(u=>u.activo).map(u=>[u.rol_id,generarToken(String(u.id),u.version_autenticacion)]));
 async function pedir(rol,ruta,method='GET',body){const r=await fetch(base+'/api'+ruta,{method,headers:{Authorization:'Bearer '+tokens.get(rol),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
 try{
  const perfil=(await pedir(1,'/usuarios/'+superadmin.id)).body.usuario;
  const datos=u=>({nombre:u.nombre,apellido:u.apellido,nombre_usuario:u.nombre_usuario,email:u.email,telefono:u.telefono,rol_id:u.rol_id,oficina_id:u.oficina_id?String(u.oficina_id):null,motivo:'Verificación local de permisos sin cambios persistentes'});
  await t.test('Listado, búsqueda, filtros y conteo excluyen la cuenta protegida',async()=>{
   const lista=await pedir(2,'/usuarios');assert.equal(lista.status,200);assert.ok(lista.body.usuarios.every(u=>u.rol_id!==1));assert.equal(lista.body.total,antes.filter(u=>u.rol_id!==1).length);
   for(const query of ['q='+encodeURIComponent(superadmin.nombre_usuario),'rol_id=1','rol_id=1&activo=true']){const r=await pedir(2,'/usuarios?'+query);assert.equal(r.status,200);assert.ok(r.body.usuarios.every(u=>u.rol_id!==1));if(query.startsWith('rol_id'))assert.equal(r.body.total,0);}
   const dash=await pedir(2,'/dashboard');assert.equal(dash.status,200);assert.equal(dash.body.usuarios,lista.body.total);assert.equal(dash.body.documentos,undefined);assert.equal(dash.body.recientes,undefined);
  });
  await t.test('Detalle, edición, contraseña, actividad y endpoints auxiliares no revelan la cuenta',async()=>{
   for(const [ruta,method,body] of [
    ['/usuarios/'+superadmin.id,'GET'],['/usuarios/'+superadmin.id,'PUT',datos(perfil)],
    ['/usuarios/'+superadmin.id+'/actividad','POST',{activo:false,motivo:'Verificación de protección'}],
    ['/usuarios/'+superadmin.id+'/clave','POST',{contrasena:randomBytes(20).toString('hex')}],
    ['/ubicaciones?usuario_id='+superadmin.id,'GET'],['/campos-opcionales?usuario_id='+superadmin.id,'GET']
   ]){const r=await pedir(2,ruta,method,body);assert.equal(r.status,404,ruta);assert.equal(r.body.error,'Cuenta inexistente',ruta);assert.equal(r.body.usuario,undefined);}
  });
  await t.test('Ningún rol administrativo puede crear ni convertir otra cuenta a Superadministrador',async()=>{
   for(const rol of [1,2]){
    const r=await pedir(rol,'/usuarios','POST',{nombre:'No persistir',apellido:'Validación',nombre_usuario:'no-crear-superadmin',rol_id:1,contrasena:randomBytes(20).toString('hex')});assert.equal(r.status,409);
    const cuenta=(await pedir(1,'/usuarios/'+admin.id)).body.usuario;
    assert.equal((await pedir(rol,'/usuarios/'+admin.id,'PUT',{...datos(cuenta),rol_id:1})).status,409);
   }
  });
  await t.test('Superadministrador conserva listado, detalle propio y demás cuentas; dashboard por cinco roles',async()=>{
   const r=await pedir(1,'/usuarios');assert.equal(r.status,200);assert.equal(r.body.total,antes.length);assert.ok(r.body.usuarios.some(u=>u.rol_id===1));
   for(const u of antes)assert.equal((await pedir(1,'/usuarios/'+u.id)).status,200);
   for(const rol of [1,2,3,4,5])if(tokens.has(rol)){const d=await pedir(rol,'/dashboard');assert.equal(d.status,200);assert.equal(d.body.alcance,({1:'global',2:'administrativo',3:'institucional',4:'institucional',5:'personal'})[rol]);}
  });
  await t.test('Edición propia y oficina: servicios y PostgreSQL reales, transacción revertida',async()=>{
   // No cambia sesiones, nombres ni auditorías persistentes de las cuentas existentes.
   const oficina=(await pool.query('SELECT id::text,nombre,activa FROM oficinas ORDER BY id LIMIT 1')).rows[0];assert.ok(oficina);
   const conectar=pool.connect.bind(pool);pool.connect=async()=>{const c=await conectar();const q=c.query.bind(c);return {query:(sql,...args)=>q(sql==='COMMIT'?'ROLLBACK':sql,...args),release:()=>c.release()};};
   try{
    assert.deepEqual(await editarUsuario(String(superadmin.id),String(superadmin.id),datos(perfil)),{actualizado:true});
    assert.deepEqual(await editarOficina(String(admin.id),oficina.id,{nombre:oficina.nombre,motivo:'Verificación local con rollback'}),{actualizado:true});
   }finally{pool.connect=conectar;}
  });
  await t.test('Tipos propios: edición, aislamiento, historia y retirada sin perder documentos',async()=>{
   const propio=antes.find(u=>u.rol_id===5&&u.oficina_id),direccion=antes.find(u=>u.rol_id===3),secretaria=antes.find(u=>u.rol_id===4);
   async function como(u,ruta,method='GET',body){const r=await fetch(base+'/api'+ruta,{method,headers:{Authorization:'Bearer '+generarToken(String(u.id),u.version_autenticacion),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
   const datos={nombre:'Tipo editable aislado',prefijo:'EDITQA'},motivo='Corrección comprobada en cluster aislado';
   const creado=await como(propio,'/tipos-documentales','POST',datos);assert.equal(creado.status,201);const ruta='/tipos-documentales/'+creado.body.id;
   let lista=await como(propio,'/tipos-documentales');let tipo=lista.body.tipos.find(x=>x.id===creado.body.id);assert.equal(tipo.editable,true);assert.equal(tipo.en_uso,false);
   assert.equal((await como(direccion,ruta,'PUT',{...datos,activo:true,motivo})).status,404);
   assert.equal((await como(admin,ruta,'PUT',{...datos,activo:true,motivo})).status,403);
   assert.equal((await como(propio,ruta,'PUT',{nombre:'Tipo corregido',prefijo:'EDITQB',activo:true,motivo})).status,200);
   const doc=await como(propio,'/documentos','POST',{tipo_id:creado.body.id,clasificacion:'RECIBIDO',asunto:'Verificar nombre histórico'});assert.equal(doc.status,201);const historico=doc.body.documento;
   assert.equal((await como(propio,ruta,'PUT',{nombre:'Nombre actual',prefijo:'EDITQB',activo:true,motivo})).status,200);
   assert.equal((await como(propio,ruta,'PUT',{nombre:'Nombre actual',prefijo:'OTRO',activo:true,motivo})).status,409);
   assert.equal((await como(propio,ruta,'DELETE',{motivo})).status,409);
   assert.equal((await como(propio,ruta,'PUT',{nombre:'Nombre actual',prefijo:'EDITQB',activo:false,motivo})).status,200);
   const detalle=(await como(propio,'/documentos/'+historico.id)).body.documento;assert.equal(detalle.tipo_nombre_guardado,historico.tipo_nombre_guardado);assert.equal(detalle.codigo_visible,historico.codigo_visible);
   assert.ok(!(await como(propio,'/documentos/opciones')).body.tipos.some(x=>x.id===creado.body.id));
   const compartido=await como(secretaria,'/tipos-documentales','POST',{nombre:'Tipo compartido aislado',prefijo:'COMPQA'});assert.equal(compartido.status,201);
   const visible=(await como(direccion,'/tipos-documentales')).body.tipos.find(x=>x.id===compartido.body.id);assert.equal(visible.editable,false);
   assert.equal((await como(direccion,'/tipos-documentales/'+visible.id,'PUT',{nombre:'No autorizado',prefijo:'COMPQA',activo:true,motivo})).status,403);
   assert.equal((await como(secretaria,'/tipos-documentales/'+visible.id,'DELETE',{motivo})).status,200);
   assert.ok(!(await como(secretaria,'/tipos-documentales')).body.tipos.some(x=>x.id===visible.id));
   assert.ok((await pool.query("SELECT 1 FROM auditoria_configuracion WHERE entidad='TIPO_DOCUMENTAL' AND entidad_id=$1 AND accion='EDITAR'",[creado.body.id])).rowCount);
  });
  assert.deepEqual((await pool.query('SELECT * FROM usuarios ORDER BY id')).rows,antes,'Las cuentas y credenciales deben conservarse');
 }finally{await new Promise(r=>server.close(r));await pool.end();}
});
