import {URL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {parse} from 'dotenv';
import pg from 'pg';
import {generarHash} from '../../dist/shared/security/password.js';
assert.equal(process.env.ACTUALIZACION_PRODUCCION_AUTORIZADA,'PROBAR_SOLO_RESTAURACION');
const dir=path.resolve('../.private/actualizacion-20261026'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'respaldo-verificado.json')));
assert.equal(manifest.restauracionVerificada,true);
const local=new URL(parse(fs.readFileSync('.env')).DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(local.hostname));local.pathname='/'+manifest.restauracion.nombre;assert.match(local.pathname,/^\/sistema_web_final_qa_archivo_[a-f0-9]{32}$/);
const c=new pg.Client({connectionString:local.toString()});await c.connect();
async function guard(){const r=(await c.query("SELECT current_database() db,(SELECT oid FROM pg_database WHERE datname=current_database()) oid,inet_server_addr()::text host,current_setting('neon.branch_id',true) rama")).rows[0];assert.equal(r.db,manifest.restauracion.nombre);assert.equal(r.oid,manifest.restauracion.oid);assert.equal(r.host,manifest.restauracion.host);assert.ok(!r.rama);}
const suffix=randomBytes(5).toString('hex'),password='QA-Aislada-'+randomBytes(12).toString('hex');
let f;
try{
 await guard();await c.query('BEGIN');const admin=(await c.query("SELECT u.id::text FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.activo AND r.nombre='Administrador' ORDER BY u.id LIMIT 1")).rows[0];assert.ok(admin,'Se requiere un actor administrativo existente en la restauración');
 await c.query("SELECT set_config('app.usuario_actor_id',$1,true),set_config('app.motivo_documental','Fixture aislada de actualización',true)",[admin.id]);
 const roles=Object.fromEntries((await c.query('SELECT id::text,nombre FROM roles')).rows.map(r=>[r.nombre,r.id])),oficinas=Object.fromEntries((await c.query('SELECT id::text,nombre FROM oficinas')).rows.map(r=>[r.nombre,r.id]));
 const oficina=(await c.query("INSERT INTO oficinas(nombre) VALUES($1) RETURNING id::text",['Oficina ensayo QA '+suffix])).rows[0].id;
 const hash=await generarHash(password);
 async function usuario(nombre,rol,oficina_id,activo=true){return (await c.query(`INSERT INTO usuarios(nombre,apellido,nombre_usuario,rol_id,oficina_id,contrasena_hash,activo) VALUES('Ensayo QA',$1,$2,$3,$4,$5,$6) RETURNING id::text,nombre_usuario,oficina_id::text`,[nombre,'ensayo_'+nombre+'_'+suffix,roles[rol],oficina_id,hash,activo])).rows[0];}
 f={password,oficina,nombreOficina:'Oficina ensayo QA '+suffix,direccion:oficinas['Dirección'],
 admin:await usuario('admin','Administrador',null),usuario:await usuario('usuario','Usuario',oficina),otro:await usuario('otro','Usuario',oficina),inactivo:await usuario('inactivo','Usuario',oficina,false),director:await usuario('director','Director(a)',oficinas['Dirección']),secretaria:await usuario('secretaria','Secretaria de Dirección',oficinas['Mesa de Partes'])};f.incompatible=f.admin;
 await c.query('COMMIT');
 await c.query('BEGIN');await c.query("SELECT set_config('app.usuario_actor_id',$1,true),set_config('app.motivo_documental','Ubicación de ensayo aislado',true)",[f.usuario.id]);
 const estante=(await c.query('INSERT INTO estantes(codigo,usuario_id,oficina_id) VALUES($1,$2,$3) RETURNING id::text',['EQA'+suffix.slice(0,7).toUpperCase().replace(/[0-9]/g,n=>String.fromCharCode(65+Number(n))),f.usuario.id,oficina])).rows[0].id;
 f.archivador=(await c.query('INSERT INTO archivadores(estante_id,numero) VALUES($1,1) RETURNING id::text',[estante])).rows[0].id;await c.query('COMMIT');
 await c.query('BEGIN');await c.query("SELECT set_config('app.usuario_actor_id',$1,true),set_config('app.motivo_documental','Fixture aislada de actualización',true),set_config('app.archivo_operacion','CREAR',true)",[f.admin.id]);
 for(const key of ['usuario','secretaria','futuro']){const user=key==='futuro'?f.usuario:f[key];const archivo=(await c.query(`INSERT INTO archivos_institucionales(oficina_id,nombre,responsabilidad,creado_por_id,fecha_creacion,motivo)
 VALUES($1,$2,'Archivo exclusivo de ensayo QA',$3,clock_timestamp(),'Fixture aislada de actualización') RETURNING id::text`,[user.oficina_id,'QA '+key+' '+suffix,f.admin.id])).rows[0].id;
 await c.query(`INSERT INTO archivos_asignaciones(archivo_id,responsable_id,fecha_inicio,formalizado_por_id,motivo) SELECT id,$2,fecha_creacion+($4::boolean::int*interval '1 day'),$3,'Fixture aislada de actualización' FROM archivos_institucionales WHERE id=$1`,[archivo,user.id,f.admin.id,key==='futuro']);if(key==='futuro')f.futuro=archivo;}
 await c.query('COMMIT');
 f.tipo=(await c.query("SELECT id::text FROM tipos_documentales WHERE NOT requiere_clave AND prefijo_codigo IS NOT NULL ORDER BY (nombre='Acta') DESC,id LIMIT 1")).rows[0].id;
 f.protegidoTipo=(await c.query("SELECT id::text FROM tipos_documentales WHERE requiere_clave AND nombre='SíseVe'")).rows[0].id;
 await c.query('BEGIN');await c.query("SELECT set_config('app.usuario_actor_id',$1,true),set_config('app.tipo_restringido_id',$2,true),set_config('app.motivo_documental','Caso exclusivo de ensayo QA',true)",[f.usuario.id,f.protegidoTipo]);
 f.protegidoDocumento=(await c.query(`INSERT INTO documentos(tipo_documental_id,asunto,registrado_por_id,responsable_actual_id,oficina_responsable_id,estado_tramite) VALUES($1,'Caso protegido exclusivo de ensayo QA',$2,$2,$3,'RECIBIDO') RETURNING id::text`,[f.protegidoTipo,f.usuario.id,oficina])).rows[0].id;await c.query('COMMIT');
 f.fallo='QA_FALLO_INGRESO_'+randomBytes(8).toString('hex');assert.match(f.fallo,/^QA_FALLO_INGRESO_[a-f0-9]+$/);
 await c.query(`CREATE FUNCTION fn_qa_actualizacion_fallo() RETURNS trigger LANGUAGE plpgsql AS $q$ BEGIN IF NEW.proposito='${f.fallo}' THEN RAISE EXCEPTION 'Fallo de prueba aislada' USING ERRCODE='23514'; END IF; RETURN NEW; END; $q$; CREATE TRIGGER zz_qa_actualizacion_fallo BEFORE INSERT ON ingresos_mesa_partes FOR EACH ROW EXECUTE FUNCTION fn_qa_actualizacion_fallo()`);
 const runtime=new URL(local);runtime.searchParams.set('options','-c role=sistema_web_app');
 fs.writeFileSync(path.join(dir,'fixtures-ensayo.json'),JSON.stringify(f),{mode:0o600});
 for(const suite of ['continuidad','ciclo-ingresos','primer-ingreso','vinculacion','archivos']){
  await guard();const result=spawnSync(process.execPath,['--import','tsx','--test','tests/'+suite+'.integration.mjs'],{env:{...process.env,DATABASE_URL:runtime.toString(),ARCHIVOS_QA_AUTORIZADA:'SOLO_COPIA_LOCAL',ARCHIVOS_QA_ROL_EFECTIVO:'sistema_web_app',ARCHIVOS_QA_OID:String(manifest.restauracion.oid),ARCHIVOS_QA_FIXTURES:JSON.stringify(f)},windowsHide:true,encoding:'utf8',maxBuffer:4*1024*1024});
  fs.writeFileSync(path.join(dir,suite+'.log'),result.stdout+'\n'+result.stderr,{mode:0o600});console.log(result.stdout);if(result.stderr)console.log(result.stderr);assert.equal(result.status,0,'Suite de ensayo incompleta: '+suite);
 }
 console.log({ensayoIntegral:true,rolEfectivo:'sistema_web_app',baseSeparada:manifest.restauracion.nombre});
}finally{await c.query('ROLLBACK').catch(()=>{});await guard();await c.query('DROP TRIGGER IF EXISTS zz_qa_actualizacion_fallo ON ingresos_mesa_partes; DROP FUNCTION IF EXISTS fn_qa_actualizacion_fallo()');await c.end();}
