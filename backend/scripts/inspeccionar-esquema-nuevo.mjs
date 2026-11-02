import fs from 'node:fs';
import {parse} from 'dotenv';
import pg from 'pg';
import {URL} from 'node:url';
import {createHash} from 'node:crypto';
const original=parse(fs.readFileSync('.env')).DATABASE_URL;
const url=new URL(original);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Se requiere configuración local');
fs.mkdirSync('.private/esquema-nuevo',{recursive:true});
for(const base of ['sistema_web_final','sistema_web_documental_final']){
 url.pathname='/'+base;const c=new pg.Client({connectionString:url.toString(),options:'-c default_transaction_read_only=on'});await c.connect();
 try{
 const identidad=(await c.query("SELECT current_database() base,inet_server_addr()::text host,inet_server_port() puerto,(SELECT oid::text FROM pg_database WHERE datname=current_database()) oid,current_schema() esquema,current_user rol,current_setting('neon.branch_id',true) rama")).rows[0];
 if(identidad.base!==base||identidad.rama)throw Error('Identidad inesperada');
 const tablas=(await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(t=>t.tablename),huellas={};
 for(const t of tablas){if(!/^[a-z_]+$/.test(t))throw Error('Nombre inesperado');huellas[t]=(await c.query(`SELECT count(*)::int cantidad,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) hash FROM public.${t} t`)).rows[0];}
 const secuencias=(await c.query("SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows;
 const columnas=(await c.query("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
 const restricciones=(await c.query("SELECT conrelid::regclass::text tabla,conname,pg_get_constraintdef(oid) definicion FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conrelid::regclass::text,conname")).rows;
 const funciones=(await c.query("SELECT proname,pg_get_functiondef(p.oid) definicion FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY proname")).rows;
 const triggers=(await c.query("SELECT tgrelid::regclass::text tabla,tgname,pg_get_triggerdef(oid) definicion FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) ORDER BY tgname")).rows;
 const indices=(await c.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY indexname")).rows;
 fs.writeFileSync('.private/esquema-nuevo/'+base+'.json',JSON.stringify({identidad,tablas,huellas,secuencias,columnas,restricciones,funciones,triggers,indices},null,2));
 console.log({identidad,tablas,filas:Object.values(huellas).reduce((s,v)=>s+v.cantidad,0),funciones:funciones.length,triggers:triggers.length,huella:createHash('sha256').update(JSON.stringify({huellas,secuencias})).digest('hex')});
 }finally{await c.end();}
}
