import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';
import {createHash} from 'node:crypto';
import {abrirProduccionLectura} from './production-config.mjs';

/** Migración explícita de production: identidad/TLS, respaldo, transacción y conservación verificados. */
export async function migrarProduccion({aplicar=false,activar=false}={}) {
 const sesion=await abrirProduccionLectura({respaldoCompleto:true});const c=sesion.cliente;
 try {
  assert.equal(sesion.identidad.usuario,'neondb_owner','DDL usa la credencial separada; nunca el rol de Express');
  const ultimo=JSON.parse(fs.readFileSync('../.private/production/ULTIMO_RESPALDO.json','utf8'));
  assert.equal(ultimo.rama,sesion.configuracion.NEON_BRANCH_ID);assert.equal(ultimo.proyecto,sesion.configuracion.NEON_PROJECT_ID);
  assert.ok(ultimo.legible&&ultimo.integridadGcm&&ultimo.pgRestoreSoloDecodificacion);
  assert.ok(Date.now()-Date.parse(ultimo.fechaUtc)<86400000,'Respaldo previo de menos de 24 horas requerido');
  const archivo=fs.readFileSync(ultimo.directorio+'/'+ultimo.archivo);assert.equal(createHash('sha256').update(archivo).digest('hex'),ultimo.sha256);
  if(activar){const publicado=JSON.parse(fs.readFileSync('.private/publicacion-20261028/publicado.json','utf8'));assert.ok(publicado.backendVerificado&&publicado.frontendVerificado&&/^[a-f0-9]{40}$/.test(publicado.commit),'Verificar ambos alojamientos antes de activar el trigger final');}
  await c.query('ROLLBACK');await c.query('SET default_transaction_read_only=off');
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await c.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='60s'; SET LOCAL search_path=public,pg_catalog");
  await c.query("SELECT pg_advisory_xact_lock(hashtext('administracion-institucional'))");
  const id=(await c.query("SELECT current_database() base,current_user rol,current_setting('neon.branch_id',true) rama,current_schema() esquema")).rows[0];
  assert.equal(id.base,'neondb');assert.equal(id.rol,'neondb_owner');assert.equal(id.rama,sesion.configuracion.NEON_BRANCH_ID);assert.equal(id.esquema,'public');
  for(const t of ['archivos_institucionales','ingresos_mesa_partes','archivos_relevos','archivos_sustituciones'])assert.equal((await c.query('SELECT to_regclass($1) tabla',['public.'+t])).rows[0].tabla,null,'No migrar integración descartada');
  const baseTablas=['archivadores','autorizaciones_tipos_restringidos','claves_tipos_documentales','correlativos_documentales','documentos','estantes','historial_modificaciones','movimientos_documentales','oficinas','roles','tipos_documentales','usuarios'];
  const tablas=(await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(r=>r.tablename);for(const t of baseTablas)assert.ok(tablas.includes(t),'Esquema de partida incompleto: '+t);
  await c.query('SELECT d.destinatario_autorizado_id,d.oficina_destino_autorizada_id,d.decision_autorizada_por_id,u.version_autenticacion,e.oficina_id FROM documentos d CROSS JOIN usuarios u CROSS JOIN estantes e LIMIT 0');
  async function huella(){const datos={},secuencias={};for(const t of baseTablas)datos[t]=(await c.query(`SELECT count(*)::int cantidad,md5(coalesce(string_agg((to_jsonb(t)-'clasificacion_registro')::text,'' ORDER BY (to_jsonb(t)-'clasificacion_registro')::text),'')) hash FROM public."${t}" t`)).rows[0];const seq=(await c.query("SELECT sequencename FROM pg_sequences WHERE schemaname='public' AND sequencename<>'entregas_secretaria_historial_id_seq' ORDER BY sequencename")).rows;for(const {sequencename:t}of seq){assert.match(t,/^[a-z_]+$/);secuencias[t]=(await c.query(`SELECT last_value::text,is_called FROM public."${t}"`)).rows[0];}return {datos,secuencias};}
  const antes=await huella();
  await c.query('CREATE TABLE IF NOT EXISTS public.migraciones_aplicacion(nombre text PRIMARY KEY,sha256 text NOT NULL,aplicada_en timestamptz NOT NULL DEFAULT clock_timestamp())');
  const nombres=activar?['004-exigir-clasificacion.sql']:['001-clasificacion-aditiva.sql','002-decisiones-entrega.sql','003-relaciones-delegaciones.sql'];const realizadas=[];
  for(const nombre of nombres){const sql=fs.readFileSync(new URL('./sql/produccion-vigente/'+nombre,import.meta.url),'utf8');const hash=createHash('sha256').update(sql).digest('hex');const previa=(await c.query('SELECT sha256 FROM migraciones_aplicacion WHERE nombre=$1',[nombre])).rows[0];if(previa){assert.equal(previa.sha256,hash,'Migración aplicada inmutable');continue;}
   if(nombre==='001-clasificacion-aditiva.sql'){assert.equal((await c.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='documentos' AND column_name='clasificacion_registro'")).rows[0].n,0,'Clasificación preexistente sin migración reconocida');}
   if(nombre==='002-decisiones-entrega.sql')assert.equal((await c.query("SELECT to_regclass('public.entregas_secretaria') tabla")).rows[0].tabla,null,'Flujo preexistente sin migración reconocida');
   await c.query(sql);await c.query('INSERT INTO migraciones_aplicacion(nombre,sha256) VALUES($1,$2)',[nombre,hash]);realizadas.push(nombre);
  }
  assert.deepEqual(await huella(),antes,'Datos o correlativos anteriores alterados');
  for(const t of ['entregas_secretaria','entregas_secretaria_historial','documentos_relaciones','delegaciones_personales'])assert.equal((await c.query("SELECT has_table_privilege('sistema_web_app',$1,'SELECT') permiso",['public.'+t])).rows[0].permiso,true);
  const despues=await huella();await c.query(aplicar?'COMMIT':'ROLLBACK');
  const resultado={fecha:new Date().toISOString(),aplicado:aplicar,activacion:activar,identidad:id,migraciones:realizadas,conservacion:despues,respaldo:ultimo.archivo};
  fs.mkdirSync('.private/publicacion-20261028',{recursive:true});fs.writeFileSync('.private/publicacion-20261028/'+(activar?'activacion':'migracion')+(aplicar?'':'-ensayo')+'.json',JSON.stringify(resultado,null,2));
  console.log({aplicado:aplicar,activacion:activar,migraciones:realizadas,documentosConservados:antes.datos.documentos.cantidad,tablasConservadas:baseTablas.length,secuenciasConservadas:true});
 }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}finally{await c.end();}
}
if(process.argv[1]?.endsWith('migrar-produccion-vigente.mjs'))migrarProduccion({aplicar:process.argv.includes('--aplicar'),activar:process.argv.includes('--activar')}).catch(e=>{console.error('Migración detenida',{tipo:e.name,codigo:e.code??null,mensaje:e instanceof assert.AssertionError?e.message:undefined});process.exitCode=1;});
