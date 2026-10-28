import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {parse} from 'dotenv';
import pg from 'pg';
import {validarUrlLocal,verificarConexionLocal} from '../src/config/local.ts';

assert.notEqual(process.env.RENDER,'true','Este comando solo admite desarrollo local');
assert.notEqual(process.env.NODE_ENV,'production','Este comando no migra producción');
const local=parse(fs.readFileSync('.env'));
const conexion=process.env.DATABASE_URL??local.DATABASE_URL;
validarUrlLocal(conexion);
const c=new pg.Client({connectionString:conexion});
await c.connect();
try {
 const identidad=await verificarConexionLocal(c,conexion,false);
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 await c.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'");
 await c.query("SELECT pg_advisory_xact_lock(hashtext('administracion-institucional'))");
 const tablas=(await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('migraciones_locales','entregas_secretaria','entregas_secretaria_historial') ORDER BY tablename")).rows.map(r=>r.tablename);
 const secuencias=(await c.query("SELECT sequencename FROM pg_sequences WHERE schemaname='public' AND sequencename<>'entregas_secretaria_historial_id_seq' ORDER BY sequencename")).rows.map(r=>r.sequencename);
 async function huella(){
  const datos={},secuencia={};
  for(const t of tablas){
   assert.match(t,/^[a-z_]+$/);
   datos[t]=(await c.query(`SELECT count(*)::int cantidad,md5(coalesce(string_agg((to_jsonb(t)-'clasificacion_registro')::text,'' ORDER BY (to_jsonb(t)-'clasificacion_registro')::text),'')) huella FROM public."${t}" t`)).rows[0];
  }
  for(const t of secuencias){assert.match(t,/^[a-z_]+$/);secuencia[t]=(await c.query(`SELECT last_value::text,is_called FROM public."${t}"`)).rows[0];}
  return {datos,secuencia};
 }
 const antes=await huella();
 await c.query('CREATE TABLE IF NOT EXISTS public.migraciones_locales(nombre text PRIMARY KEY,sha256 text NOT NULL,aplicada_en timestamptz NOT NULL DEFAULT clock_timestamp())');
 const aplicadas=[];
 for(const nombre of ['20261027-clasificacion-local.sql','20261027-entrega-secretaria-local.sql','20261027-decision-direccion-local.sql','20261027-documentos-relacionados-local.sql','20261027-flujo-propio-direccion-local.sql','20261027-decision-secretaria-local.sql','20261027-delegacion-personal-local.sql']){
  const sql=fs.readFileSync('scripts/sql/'+nombre,'utf8');const sha=createHash('sha256').update(sql).digest('hex');
  const previa=(await c.query('SELECT sha256 FROM public.migraciones_locales WHERE nombre=$1',[nombre])).rows[0];
  if(previa){assert.equal(previa.sha256,sha,'No se modifica una migración ya aplicada');continue;}
  await verificarConexionLocal(c,conexion,false);
  await c.query(sql);
  await c.query('INSERT INTO public.migraciones_locales(nombre,sha256) VALUES($1,$2)',[nombre,sha]);aplicadas.push(nombre);
 }
 await verificarConexionLocal(c,conexion);
 assert.deepEqual(await huella(),antes,'Una migración alteró datos o secuencias anteriores');
 await c.query('COMMIT');
 fs.mkdirSync('.private/local',{recursive:true});
 if(aplicadas.length||!fs.existsSync('.private/local/migracion.json'))fs.writeFileSync('.private/local/migracion.json',JSON.stringify({fecha:new Date().toISOString(),identidad,aplicadas,tablasPrevias:tablas.length,documentosPrevios:antes.datos.documentos.cantidad,datosAnterioresConservados:true,secuenciasAnterioresConservadas:true},null,2));
 console.log({identidad,aplicadas,documentosConservados:antes.datos.documentos.cantidad,tablasPreviasConservadas:tablas.length,secuenciasConservadas:true});
} catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}finally{await c.end();}
