import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pool} from '../dist/config/database.js';
import {app} from '../dist/app.js';
import {generarToken} from '../dist/shared/security/jwt.js';
import {verificarConexionLocal} from '../dist/config/local.js';
import {env} from '../dist/config/env.js';

test('Destinatarios operativos en la base local habitual',async t=>{
 const verificacion=await pool.connect();
 try{await verificarConexionLocal(verificacion,env.DATABASE_URL)}finally{verificacion.release()}
 const actores=(await pool.query(`SELECT u.id::text,u.oficina_id::text,u.version_autenticacion,u.nombre_usuario,r.codigo
 FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.activo ORDER BY u.id`)).rows;
 const administrativos=actores.filter(u=>['ADMINISTRADOR','SUPERADMINISTRADOR'].includes(u.codigo));
 const operativos=actores.filter(u=>['DIRECTOR','SECRETARIA_DIRECCION','USUARIO'].includes(u.codigo));
 assert.equal(administrativos.length,2);assert.equal(operativos.length,3);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port+'/api';
 const pedir=async(a,ruta,body,method='POST')=>{const r=await fetch(base+ruta,{headers:{Authorization:'Bearer '+generarToken(a.id,a.version_autenticacion),'Content-Type':'application/json'},...(body?{method,body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}};
 try{
  for(const actor of operativos)await t.test(actor.codigo+': búsqueda vacía, texto y oficina',async()=>{
   for(const q of ['',...administrativos.map(a=>a.nombre_usuario)]){
    const r=await pedir(actor,'/documentos/destinatarios?q='+encodeURIComponent(q));
    assert.equal(r.status,200,JSON.stringify(r.body));
    assert.ok(r.body.personas.every(u=>!administrativos.some(a=>a.id===u.id)),JSON.stringify(r.body));
   }
   for(const destino of operativos){
    const r=await pedir(actor,'/documentos/destinatarios?q='+destino.nombre_usuario);
    assert.equal(r.status,200);assert.ok(r.body.personas.some(u=>u.id===destino.id));
    const f=await pedir(actor,'/documentos/destinatarios?oficina_id='+destino.oficina_id);
    assert.equal(f.status,200);assert.ok(f.body.personas.some(u=>u.id===destino.id));
   }
  });
  await t.test('Administración conserva listado y detalle administrativos',async()=>{
   const superadmin=administrativos.find(a=>a.codigo==='SUPERADMINISTRADOR');
   const lista=await pedir(superadmin,'/usuarios');assert.equal(lista.status,200);
   for(const a of administrativos){assert.ok(lista.body.usuarios.some(u=>u.id===a.id));assert.equal((await pedir(superadmin,'/usuarios/'+a.id)).status,200)}
  });
  await t.test('API: rechaza roles administrativos y conserva delegaciones válidas con rollback',async()=>{
   const conectar=pool.connect.bind(pool),c=await conectar();
   const tablas=['documentos','delegaciones_documento','auditoria_documental','correlativos_documentales','documentos_oficina','auditoria_configuracion','usuarios'];
   const huella=async()=>{const r={};for(const tabla of tablas)r[tabla]=(await c.query(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY to_jsonb(t)::text),'')) h FROM ${tabla} t`)).rows[0].h;return r};
   const antes=await huella();
   await c.query('BEGIN');
   await c.query('LOCK TABLE '+tablas.join(',')+' IN SHARE ROW EXCLUSIVE MODE');
   const secuencias=[];
   for(const {s} of (await c.query(`SELECT DISTINCT seq.oid::regclass::text s FROM pg_class seq JOIN pg_depend dep ON dep.objid=seq.oid JOIN pg_class tabla ON tabla.oid=dep.refobjid WHERE seq.relkind='S' AND tabla.relname=ANY($1::text[])`,[tablas])).rows){
    if(s)secuencias.push({s,...(await c.query('SELECT last_value::text,is_called FROM '+s)).rows[0]});
   }
   pool.connect=callback=>typeof callback==='function'?conectar(callback):Promise.resolve({query:(sql,...args)=>c.query(sql==='BEGIN'?'SAVEPOINT peticion':sql==='COMMIT'?'RELEASE SAVEPOINT peticion':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT peticion':sql,...args),release:()=>{}});
   try{
    const superadmin=administrativos.find(a=>a.codigo==='SUPERADMINISTRADOR');
    for(const a of administrativos){
     await c.query('SAVEPOINT administrar');
     const u=(await pedir(superadmin,'/usuarios/'+a.id)).body.usuario;
     const body=Object.fromEntries(['nombre','apellido','nombre_usuario','email','telefono','rol_id','oficina_id'].map(k=>[k,u[k]]));
     const cambio=await pedir(superadmin,'/usuarios/'+a.id,{...body,nombre:'QA temporal',motivo:'Verificación local reversible'},'PUT');
     assert.equal(cambio.status,200,JSON.stringify(cambio.body));
     assert.equal((await c.query('SELECT nombre FROM usuarios WHERE id=$1',[a.id])).rows[0].nombre,'QA temporal');
     await c.query('ROLLBACK TO SAVEPOINT administrar');
    }
    for(const actor of operativos){
     await c.query('SAVEPOINT escenario');
     const op=await pedir(actor,'/documentos/opciones');assert.equal(op.status,200);
     assert.equal(op.body.oficina_actual_id,actor.oficina_id);
     assert.deepEqual(op.body.oficinas,(await c.query('SELECT id::text,nombre FROM oficinas WHERE activa ORDER BY nombre')).rows);
     const alta={tipo_id:op.body.tipos[0].id,clasificacion:'RECIBIDO',asunto:'QA destinatarios temporal',conservar_en_mesa:actor.codigo==='SECRETARIA_DIRECCION'};
     const r=await pedir(actor,'/documentos',alta);assert.equal(r.status,201,JSON.stringify(r.body));
     const d=r.body.documento;
     for(const a of administrativos){
      const rechazo=await pedir(actor,'/documentos/'+d.id+'/delegar',{revision:d.revision,usuario_id:a.id});
      assert.equal(rechazo.status,400,JSON.stringify(rechazo.body));
      assert.equal((await pedir(actor,'/documentos',{...alta,destino:{usuario_id:a.id}})).status,400);
     }
     for(const destino of [{usuario_id:operativos.find(u=>u.id!==actor.id).id},{nombre:'Persona temporal sin cuenta'}]){
      await c.query('SAVEPOINT valido');
      const delegado=await pedir(actor,'/documentos/'+d.id+'/delegar',{revision:d.revision,...destino});
      assert.equal(delegado.status,200,JSON.stringify(delegado.body));assert.equal(delegado.body.documento.situacion,'DELEGADO');
      assert.equal(delegado.body.documento.registrado_por,actor.id);
      const receptor=destino.usuario_id&&operativos.find(u=>u.id===destino.usuario_id);
      if(receptor){const lectura=await pedir(receptor,'/documentos/'+d.id);assert.equal(lectura.status,200);assert.ok(Object.values(lectura.body.documento.permisos).every(p=>p===false));}
      assert.equal((await pedir(actor,'/documentos/'+d.id+'/historial')).status,200);
      await c.query('ROLLBACK TO SAVEPOINT valido');
      const inmediata=await pedir(actor,'/documentos',{...alta,destino});assert.equal(inmediata.status,201,JSON.stringify(inmediata.body));
     }
     await c.query('ROLLBACK TO SAVEPOINT escenario');
    }
   }finally{
    pool.connect=conectar;
    // Estas tablas permanecen bloqueadas: ningún otro escritor puede avanzar las secuencias.
    for(const s of secuencias)await c.query('SELECT setval($1::regclass,$2::bigint,$3)',[s.s,s.last_value,s.is_called]);
    await c.query('ROLLBACK');
    const despues=await huella();c.release();
    assert.deepEqual(despues,antes,'La base local debe quedar idéntica');
   }
  });
 }finally{await new Promise(r=>server.close(r));await pool.end()}
});
