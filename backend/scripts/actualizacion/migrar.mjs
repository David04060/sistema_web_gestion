import {URL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parse} from 'dotenv';
import pg from 'pg';
import {abrirProduccionLectura} from '../production-config.mjs';
const version='20261026-archivo-v1';
const ensayo=process.argv.includes('--ensayo'),activar=process.argv.includes('--activar'),desactivar=process.argv.includes('--desactivar');
assert.ok(!(activar&&desactivar));
assert.equal(process.env.ACTUALIZACION_PRODUCCION_AUTORIZADA,ensayo?'ENSAYAR_VERSION_20261026':activar?'ACTIVAR_VERSION_20261026':desactivar?'DESACTIVAR_VERSION_20261026':'MIGRAR_VERSION_20261026');
const dir=path.resolve('../.private/actualizacion-20261026'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'respaldo-verificado.json')));
assert.equal(manifest.restauracionVerificada,true);assert.equal(manifest.version,version);assert.equal(manifest.resultado.integridadGcm,true);
const sha=x=>createHash('sha256').update(x).digest('hex');assert.equal(sha(fs.readFileSync(manifest.backup)),manifest.resultado.sha256);
let c,sesion;let lock=false;const aplicadas=[],existentes=[];
try{
 if(ensayo){const cfg=parse(fs.readFileSync('.env'));const url=new URL(cfg.DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));url.pathname='/'+manifest.restauracion.nombre;assert.match(url.pathname,/^\/sistema_web_final_qa_archivo_[a-f0-9]{32}$/);c=new pg.Client({connectionString:url.toString(),application_name:'documental-migracion-20261026'});await c.connect();
  const ident=(await c.query("SELECT current_database() db,(SELECT oid FROM pg_database WHERE datname=current_database()) oid,inet_server_addr()::text host,current_setting('neon.branch_id',true) rama")).rows[0];assert.equal(ident.db,manifest.restauracion.nombre);assert.equal(ident.oid,manifest.restauracion.oid);assert.equal(ident.host,manifest.restauracion.host);assert.ok(!ident.rama);
  if(!(await c.query("SELECT 1 FROM pg_roles WHERE rolname='sistema_web_app'")).rowCount)await c.query('CREATE ROLE sistema_web_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');
 }else{
  sesion=await abrirProduccionLectura({respaldoCompleto:true});c=sesion.cliente;assert.equal(sesion.configuracion.NEON_BRANCH_ID,manifest.rama);assert.equal(sesion.configuracion.NEON_PROJECT_ID,manifest.proyecto);assert.notEqual(sesion.identidad.usuario,'sistema_web_app');
  const proveedor=JSON.parse(fs.readFileSync('../.private/production/neon-metadata.json'));assert.equal(proveedor.branchId,manifest.rama);assert.equal(proveedor.projectId,manifest.proyecto);
  await c.query('ROLLBACK');await c.query('SET default_transaction_read_only=off');await c.query("SET application_name='documental-migracion-20261026'");
 }
 assert.ok((await c.query("SELECT has_schema_privilege('public','CREATE') permiso")).rows[0].permiso);
 const identidad=(await c.query('SELECT current_database() db,(SELECT oid::text FROM pg_database WHERE datname=current_database()) oid')).rows[0];
 await c.query("SELECT set_config('app.actualizacion_base_esperada',$1,false),set_config('app.actualizacion_oid_esperado',$2,false),set_config('app.actualizacion_modo',$3,false),set_config('app.actualizacion_rama_esperada',$4,false)",[identidad.db,identidad.oid,ensayo?'ensayo-local':'produccion',ensayo?'':manifest.rama]);
 lock=(await c.query("SELECT pg_try_advisory_lock(hashtext('administracion-institucional')) adquirido")).rows[0].adquirido;assert.ok(lock,'Existe una escritura institucional en curso; reintentar en una ventana controlada');
 await c.query("SET TIME ZONE 'UTC'");
 const ledger=(await c.query("SELECT to_regclass('public.migraciones_archivisticas') tabla")).rows[0].tabla;
 if(!ledger){
  assert.equal((await c.query("SELECT to_regclass('public.archivos_institucionales') tabla")).rows[0].tabla,null,'Esquema parcial sin registro de migraciones: requiere revisión');
  const pre=JSON.parse(fs.readFileSync('scripts/sql/produccion-20261026/precondiciones.json'));
  for(const [nombre,hash] of Object.entries(pre)){const f=(await c.query("SELECT pg_get_functiondef(oid) sql FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=$1 AND prokind='f'",[nombre])).rows;assert.equal(f.length,1);assert.equal(sha(f[0].sql.replaceAll('\r\n','\n')),hash,'Protección de origen distinta: '+nombre);}
  assert.equal((await c.query("SELECT count(*)::int n FROM documentos WHERE estado_tramite NOT IN ('PENDIENTE_DECISION','EN_TRASLADO','RECIBIDO','RECHAZADO','CANCELADO')")).rows[0].n,0);
  assert.equal((await c.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='documentos' AND column_name IN ('numero_documento','fecha_documento')")).rows[0].n,0);
 }
 // Compara exclusivamente las tablas y secuencias que existían al respaldar.
 // Con el bloqueo institucional adquirido no entran escrituras del servicio entre comparación y migración.
 async function comprobarDatos(){for(const [tabla,valor] of Object.entries(manifest.huella.rows)){
  assert.match(tabla,/^[a-z_]+$/);const r=(await c.query(`SELECT count(*)::int cantidad,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) huella FROM public."${tabla}" t`)).rows[0];assert.deepEqual(r,valor,'Datos distintos del respaldo: '+tabla);}
  for(const [seq,valor] of Object.entries(manifest.huella.seq)){assert.match(seq,/^[a-z_]+$/);assert.deepEqual((await c.query(`SELECT last_value::text,is_called FROM public."${seq}"`)).rows[0],valor,'Secuencia distinta: '+seq);}}
 if(!activar&&!desactivar)await comprobarDatos();
 const carpeta='scripts/sql/produccion-20261026';const archivos=fs.readdirSync(carpeta).filter(n=>/^\d{3}-.+\.sql$/.test(n)).sort();assert.equal(archivos.length,10);
 // El mismo SQL tiene una huella estable en Windows y en el checkout Linux del alojamiento.
 for(const archivo of archivos){const contenido=fs.readFileSync(path.join(carpeta,archivo),'utf8').replaceAll('\r\n','\n'),hash=sha(contenido),id='20261026-'+archivo.slice(0,3);
  const existe=(await c.query("SELECT to_regclass('public.migraciones_archivisticas') tabla")).rows[0].tabla;
  if(existe){const fila=(await c.query('SELECT sha256 FROM migraciones_archivisticas WHERE id=$1',[id])).rows[0];if(fila){assert.equal(fila.sha256,hash,'Migración aplicada con otro hash: '+id);existentes.push(id);continue;}}
  assert.ok(!activar&&!desactivar,'No se activa una versión incompleta');
  assert.ok(contenido.trimEnd().endsWith('COMMIT;'));
  await c.query(contenido.trimEnd().slice(0,-7));
  await c.query('INSERT INTO migraciones_archivisticas(id,sha256,version_release,origen) VALUES($1,$2,$3,$4)',[id,hash,version,archivo]);
  await c.query('COMMIT');aplicadas.push(id);
 }
 if(!activar&&!desactivar)await comprobarDatos();
 if(activar||desactivar){await c.query('BEGIN');await c.query('UPDATE capacidades_archivisticas SET activada=$2,activada_en=clock_timestamp(),activada_por=current_user WHERE version=$1',[version,activar]);await c.query('COMMIT');}
 const estado=(await c.query('SELECT version,activada FROM capacidades_archivisticas WHERE version=$1',[version])).rows[0];
 const resultado={fecha:new Date().toISOString(),modo:ensayo?'ensayo-local':'produccion',version,aplicadas,existentes,estado,datosRealesConservados:!activar&&!desactivar};
 fs.writeFileSync(path.join(dir,ensayo?'migracion-ensayo.json':activar?'activacion-production.json':desactivar?'desactivacion-production.json':'migracion-production.json'),JSON.stringify(resultado,null,2),{mode:0o600});console.log(resultado);
}catch(e){await c?.query('ROLLBACK').catch(()=>{});console.error('Actualización detenida de forma segura',{tipo:e.name,codigo:e.code??null,motivo:e.message?.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[conexión privada]')});process.exitCode=1;
}finally{if(lock)await c?.query("SELECT pg_advisory_unlock(hashtext('administracion-institucional'))").catch(()=>{});await c?.end();}
