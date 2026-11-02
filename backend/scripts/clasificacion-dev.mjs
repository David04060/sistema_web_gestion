import fs from 'node:fs';
import {URL} from 'node:url';
import assert from 'node:assert/strict';
import {parse} from 'dotenv';
import pg from 'pg';

/** Destino de desarrollo por nombre + OID + servidor; no carga ni admite Neon. */
export function configuracionCopia() {
 const manifest=JSON.parse(fs.readFileSync('.private/clasificacion-dev/destino.json'));
 const url=new URL(parse(fs.readFileSync('.env')).DATABASE_URL);
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 assert.match(manifest.nombre,/^sistema_web_final_qa_clasif_[a-f0-9]{32}$/);
 url.pathname='/'+manifest.nombre;
 return {manifest,url};
}
export async function verificarCopia(c,manifest,rol) {
 const i=(await c.query("SELECT current_database() base,current_user rol,(SELECT oid FROM pg_database WHERE datname=current_database()) oid,inet_server_addr()::text host,inet_server_port() puerto,current_schema() esquema,current_setting('neon.branch_id',true) rama")).rows[0];
 assert.equal(i.base,manifest.nombre);assert.equal(i.oid,manifest.oid);assert.equal(i.host,manifest.host);assert.ok(!i.rama);assert.equal(i.esquema,'public');
 const {url}=configuracionCopia();assert.equal(i.puerto,Number(url.port||5432));
 if(rol) assert.equal(i.rol,rol);
 return i;
}
export async function abrirCopia(propietario=false) {
 const {url,manifest}=configuracionCopia();
 if(!propietario) url.searchParams.set('options','-c role=sistema_web_app');
 const cliente=new pg.Client({connectionString:url.toString()});await cliente.connect();
 try{await verificarCopia(cliente,manifest,propietario?undefined:'sistema_web_app');}
 catch(e){await cliente.end();throw e;}
 return {cliente,url,manifest};
}

/** Comprueba por lectura el contrato SQL requerido; jamás aplica migraciones al arrancar. */
export async function verificarEsquemaCopia(c) {
 try {
  await c.query(`SELECT d.clasificacion_registro,f.documento_id,f.situacion,f.tipo,f.oficina_id,f.usuario_id,
   f.destinatario,f.asignado_por_id,f.asignado_por_nombre,f.asignado_en,
   f.confirmado_por_id,f.confirmado_por_nombre,f.confirmado_en,f.revision,
   h.id,h.documento_id,h.evento,h.actor,h.destinatario,h.fecha
   FROM public.documentos d LEFT JOIN public.entregas_secretaria f ON f.documento_id=d.id
   LEFT JOIN public.entregas_secretaria_historial h ON h.documento_id=d.id LIMIT 0`);
  const r=await c.query("SELECT to_regprocedure('public.fn_documentos_clasificacion_registro()') clasificacion,to_regprocedure('public.fn_entrega_secretaria_guardar()') entrega,to_regprocedure('public.fn_entrega_destino_coherente()') destino");
  assert.ok(Object.values(r.rows[0]).every(Boolean));
 } catch {
  throw new Error('La copia verificada no tiene el esquema de clasificación y entrega requerido. Revise las migraciones existentes; no se aplican automáticamente.');
 }
}
