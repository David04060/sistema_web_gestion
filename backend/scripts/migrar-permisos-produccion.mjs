import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {abrirProduccionLectura} from './production-config.mjs';
const s=await abrirProduccionLectura({respaldoCompleto:true}),c=s.cliente;
try{
 const respaldo=JSON.parse(fs.readFileSync('../.private/production/ULTIMO_RESPALDO.json','utf8'));
 assert.equal(respaldo.rama,s.configuracion.NEON_BRANCH_ID);assert.equal(respaldo.proyecto,s.configuracion.NEON_PROJECT_ID);
 assert.ok(respaldo.legible&&respaldo.integridadGcm&&respaldo.pgRestoreSoloDecodificacion);
 assert.ok(Date.now()-Date.parse(respaldo.fechaUtc)<3600000,'Respaldo verificado de menos de una hora requerido');
 assert.equal(createHash('sha256').update(fs.readFileSync(respaldo.directorio+'/'+respaldo.archivo)).digest('hex'),respaldo.sha256);
 const nombre='006-permisos-contenido.sql',sql=fs.readFileSync('scripts/sql/produccion-vigente/'+nombre,'utf8'),hash=createHash('sha256').update(sql).digest('hex');
 await c.query('ROLLBACK');await c.query('SET default_transaction_read_only=off');await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 await c.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='60s'; SET LOCAL search_path=public,pg_catalog");
 await c.query("SELECT pg_advisory_xact_lock(hashtext('administracion-institucional'))");
 const identidad=(await c.query("SELECT current_database() base,current_user rol,current_setting('neon.branch_id',true) rama")).rows[0];
 assert.equal(identidad.base,'neondb');assert.equal(identidad.rol,'neondb_owner');assert.equal(identidad.rama,s.configuracion.NEON_BRANCH_ID);
 for(const n of ['001-clasificacion-aditiva.sql','002-decisiones-entrega.sql','003-relaciones-delegaciones.sql','004-exigir-clasificacion.sql','005-documentos-pdf.sql']){
  const aplicada=(await c.query('SELECT sha256 FROM migraciones_aplicacion WHERE nombre=$1',[n])).rows[0];
  assert.equal(aplicada?.sha256,createHash('sha256').update(fs.readFileSync('scripts/sql/produccion-vigente/'+n)).digest('hex'),'Migración previa incompatible: '+n);
 }
 assert.equal((await c.query("SELECT to_regclass('public.delegaciones_documentales') tabla")).rows[0].tabla,null,'No debe existir la transferencia cancelada');
 const tablas=(await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'migraciones_aplicacion' ORDER BY tablename")).rows.map(t=>t.tablename);
 async function huella(){const datos={};for(const t of tablas){assert.match(t,/^[a-z_]+$/);datos[t]=(await c.query(`SELECT count(*)::int cantidad,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) hash FROM public.${t} t`)).rows[0];}return {datos,secuencias:(await c.query("SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows};}
 const antes=await huella(),previa=(await c.query('SELECT sha256 FROM migraciones_aplicacion WHERE nombre=$1',[nombre])).rows[0];
 if(previa)assert.equal(previa.sha256,hash);else{await c.query(sql);await c.query('INSERT INTO migraciones_aplicacion(nombre,sha256) VALUES($1,$2)',[nombre,hash]);}
 assert.deepEqual(await huella(),antes,'Los registros o secuencias existentes cambiaron');
 assert.equal((await c.query("SELECT has_function_privilege('sistema_web_app','public.fn_documento_permisos_contenido(bigint,bigint)','EXECUTE') permiso")).rows[0].permiso,true);
 const aplicar=process.argv.includes('--aplicar');await c.query(aplicar?'COMMIT':'ROLLBACK');
 const resultado={fecha:new Date().toISOString(),aplicada:aplicar,nombre,sha256:hash,identidad,tablasConservadas:tablas.length,secuenciasConservadas:true,respaldo:respaldo.archivo};
 fs.mkdirSync('.private/publicacion-final',{recursive:true});fs.writeFileSync('.private/publicacion-final/migracion'+(aplicar?'':'-ensayo')+'.json',JSON.stringify(resultado,null,2));console.log(resultado);
}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{await c.end();}
