// Ejecución explícita sobre la base habitual. Todo cambio de prueba se revierte.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';
import {Buffer} from 'node:buffer';
import {parse} from 'dotenv';
import {test} from 'node:test';
import ExcelJS from 'exceljs';
import {randomUUID} from 'node:crypto';
const cfg=parse(fs.readFileSync(new URL('../.env',import.meta.url)));
const url=new URL(cfg.DATABASE_URL);
assert.equal(url.pathname,'/sistema_web_documental_final');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
Object.assign(process.env,cfg,{NODE_ENV:'test',DB_PROFILE:'local'});
delete process.env.RENDER;
const {app}=await import('../dist/app.js');
const {pool}=await import('../dist/config/database.js');
const {generarToken}=await import('../dist/shared/security/jwt.js');

test('Limpieza: SQL, API, Excel y operaciones existentes conservadas mediante rollback',async t=>{
 const conectar=pool.connect.bind(pool),consultar=pool.query.bind(pool),c=await conectar();
 let server;
 const tablas=(await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1")).rows.map(r=>r.tablename);
 const huellas=async()=>{const h={};for(const tabla of tablas){assert.match(tabla,/^[a-z_]+$/);h[tabla]=(await c.query(`SELECT count(*)::int n,md5(coalesce(string_agg(to_jsonb(x)::text,'|' ORDER BY to_jsonb(x)::text),'')) hash FROM public.${tabla} x`)).rows[0];}return h;};
 const antes=await huellas();
 try{
  const i=(await c.query("SELECT current_database() base,host(inet_server_addr()) ip,current_setting('neon.branch_id',true) rama")).rows[0];
  assert.equal(i.base,'sistema_web_documental_final');assert.ok(['::1','127.0.0.1'].includes(i.ip));assert.equal(i.rama,null);
  await c.query('BEGIN');
  pool.query=(sql,...args)=>c.query(sql,...args);
  pool.connect=async()=>({query:(sql,...args)=>c.query(/^BEGIN/i.test(sql)?'SAVEPOINT api_limpieza':sql==='COMMIT'?'RELEASE SAVEPOINT api_limpieza':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT api_limpieza':sql,...args),release:()=>{}});
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api';
  const actores=(await c.query('SELECT id::text,rol_id,version_autenticacion,oficina_id::text FROM usuarios WHERE activo ORDER BY id')).rows;
  assert.equal(new Set(actores.map(a=>a.rol_id)).size,5);
  const pedir=async(a,ruta,method='GET',body)=>{const v=(await c.query('SELECT version_autenticacion FROM usuarios WHERE id=$1',[a.id])).rows[0];return fetch(base+ruta,{method,headers:{Authorization:'Bearer '+generarToken(a.id,v.version_autenticacion),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});};
  const json=async(a,ruta,method='GET',body,status=200)=>{const r=await pedir(a,ruta,method,body);const b=await r.json();assert.equal(r.status,status,JSON.stringify({ruta,b}));return b;};
  await t.test('SQL: objetos ausentes, índice conservado y protección de auditorías activa',async()=>{
   for(const nombre of ['campos_opcionales','cambios_nombre_campo','valores_documento','ix_documentos_relaciones_origen'])assert.equal((await c.query('SELECT to_regclass($1) objeto',['public.'+nombre])).rows[0].objeto,null);
   assert.ok((await c.query("SELECT to_regclass('public.documentos_relaciones_origen') objeto")).rows[0].objeto);
   assert.equal((await c.query("SELECT count(*)::int n FROM auditoria_configuracion WHERE entidad='CAMPO_OPCIONAL'")).rows[0].n,0);
   for(const tabla of ['auditoria_configuracion','auditoria_documental','pdf_eventos'])for(const operacion of ['UPDATE','DELETE','TRUNCATE']){
    await c.query('SAVEPOINT proteccion');let rechazado=false;
    try{await c.query(operacion==='UPDATE'?`UPDATE ${tabla} SET fecha=fecha`:`${operacion==='DELETE'?'DELETE FROM':'TRUNCATE'} ${tabla}`);}catch(e){assert.match(e.message,/inmutable|trunc|históric/i);rechazado=true;}
    assert.ok(rechazado,`${tabla}/${operacion}`);await c.query('ROLLBACK TO SAVEPOINT proteccion');
   }
  });
  await t.test('API: cinco roles, listado, detalle, historial, PDF y exportación con filtros',async()=>{
   for(const a of actores){
    const listado=await pedir(a,'/documentos');
    if(a.rol_id===2){assert.equal((await pedir(a,'/documentos/exportar-excel?anio=2026&mes=11')).status,403);continue;}
    assert.equal(listado.status,200);const l=await listado.json();
    const expected=(await c.query("SELECT d.id::text FROM documentos d WHERE documento_consultable_con_delegacion($1,d.id) AND ($2::int<>1 OR situacion<>'ANULADO') ORDER BY creado_en DESC,id DESC LIMIT 20",[a.id,a.rol_id])).rows.map(d=>d.id);
    assert.deepEqual(l.documentos.map(d=>d.id),expected);
    for(const d of l.documentos){const detalle=(await json(a,'/documentos/'+d.id)).documento;assert.ok(!('valores' in detalle));await json(a,'/documentos/'+d.id+'/auditoria');await json(a,'/documentos/'+d.id+'/historial');await json(a,'/documentos/'+d.id+'/pdf');}
    for(const [anio,mes,relacionados] of [[2026,11,false],[2026,11,true],[1900,1,false]]){
     const r=await pedir(a,`/documentos/exportar-excel?anio=${anio}&mes=${mes}&con_relacionados=${relacionados}`);assert.equal(r.status,200);
     const libro=new ExcelJS.Workbook();await libro.xlsx.load(Buffer.from(await r.arrayBuffer()));const hoja=libro.getWorksheet('Documentos');assert.equal(hoja.columnCount,23);hoja.getRow(1).eachCell(c=>assert.ok(!String(c.value).startsWith('Campos opcionales')));
     const filas=(await c.query(`SELECT d.codigo_visible,d.asunto FROM documentos d WHERE documento_consultable_con_delegacion($1,d.id) AND d.creado_en>=(make_date($2,$3,1)::timestamp AT TIME ZONE 'America/Lima') AND d.creado_en<((make_date($2,$3,1)+interval '1 month') AT TIME ZONE 'America/Lima') AND (NOT $4 OR documento_tiene_relacion_consultable($1,d.id)) ORDER BY d.creado_en,d.id`,[a.id,anio,mes,relacionados])).rows;
     assert.equal(hoja.rowCount,filas.length+1);filas.forEach((d,i)=>{assert.equal(hoja.getCell(i+2,1).value,d.codigo_visible);assert.equal(hoja.getCell(i+2,3).value,d.asunto);});assert.ok(hoja.autoFilter);
    }
   }
  });
  const autor=actores.find(a=>a.rol_id===5),admin=actores.find(a=>a.rol_id===2);
  await t.test('API: opciones vigentes, corrección reversible, delegación y registro',async()=>{
   const op=await json(autor,'/documentos/opciones');assert.ok(!('campos' in op));assert.ok(!('destinatarios' in op));assert.ok(op.tipos.length);
   const listado=await json(autor,'/documentos');
   const editable=listado.documentos.find(d=>d.situacion==='PERSONAL'&&d.registrado_por===autor.id);assert.ok(editable);
   const corregido=(await json(autor,'/documentos/'+editable.id,'PUT',{revision:editable.revision,motivo:'Comprobación transaccional de limpieza',asunto:editable.asunto})).documento;assert.ok(!('valores' in corregido));
   const rechazo=await pedir(autor,'/documentos/'+editable.id,'PUT',{revision:corregido.revision,motivo:'Validar contrato retirado',asunto:editable.asunto,valores:[]});assert.equal(rechazo.status,400);
   // Registrar requiere una fila nueva; se usa un tipo existente y la transacción exterior la revierte.
   const nuevo=(await json(autor,'/documentos','POST',{tipo_id:op.tipos[0].id,clasificacion:'RECIBIDO',asunto:'Comprobación transaccional de registro'},201)).documento;assert.ok(!('valores' in nuevo));
   const delegado=(await json(autor,'/documentos/'+nuevo.id+'/delegar','POST',{revision:nuevo.revision,usuario_id:actores.find(a=>a.rol_id===3).id})).documento;assert.equal(delegado.situacion,'DELEGADO');assert.ok(!('valores' in delegado));
  });
  await t.test('SQL: relevo histórico, tercero denegado y bloqueo de escritura',async()=>{
   const original=(await c.query("SELECT d.id::text FROM documentos d WHERE registrado_por=$1 AND situacion<>'ANULADO' AND NOT documento_periodo_cerrado(d.id) ORDER BY id LIMIT 1",[autor.id])).rows[0];assert.ok(original);
   await c.query("SELECT set_config('app.actor_id',$1,true),set_config('app.motivo','Comprobación reversible de relevo',true)",[admin.id]);
   const reemplazo=(await c.query(`INSERT INTO usuarios(nombre,apellido,nombre_usuario,contrasena_hash,rol_id,activo) SELECT nombre,apellido,$2,contrasena_hash,rol_id,true FROM usuarios WHERE id=$1 RETURNING id::text`,[autor.id,'qa_limpieza_'+randomUUID().replaceAll('-','')])).rows[0];
   await c.query('UPDATE usuarios SET activo=false,version_autenticacion=version_autenticacion+1 WHERE id=$1',[autor.id]);
   await c.query('UPDATE usuarios SET oficina_id=$2 WHERE id=$1',[reemplazo.id,autor.oficina_id]);
   assert.equal((await c.query('SELECT documento_periodo_cerrado($1) cerrado,documento_consultable($2,$1) lectura,documento_consultable($3,$1) tercero',[original.id,reemplazo.id,admin.id])).rows[0].lectura,true);
   assert.equal((await c.query('SELECT documento_consultable($1,$2) lectura',[admin.id,original.id])).rows[0].lectura,false);
   await json(reemplazo,'/documentos/'+original.id+'/historial');await json(reemplazo,'/documentos/'+original.id+'/pdf');const detalle=(await json(reemplazo,'/documentos/'+original.id)).documento;assert.ok(Object.entries(detalle.permisos).filter(([k])=>k!=='relacionar').every(([,v])=>!v));
   await c.query('SAVEPOINT escritura');await c.query("SELECT set_config('app.actor_id',$1,true)",[reemplazo.id]);await assert.rejects(c.query('UPDATE documentos SET asunto=asunto WHERE id=$1',[original.id]),/periodo anterior: solo lectura/i);await c.query('ROLLBACK TO SAVEPOINT escritura');
  });
  await t.test('SQL: retención conserva plazo y datos documentales',async()=>{const r=(await c.query("SELECT count(*)::int n,coalesce(bool_and(vence_en-anulado_en=interval '14 days'),true) plazo FROM pdf_retenciones_anulacion")).rows[0];assert.ok(r.plazo);});
 }finally{
  await c.query('ROLLBACK');pool.connect=conectar;pool.query=consultar;assert.deepEqual(await huellas(),antes);c.release();if(server)await new Promise(r=>server.close(r));await pool.end();
 }
});
