import {URL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,createDecipheriv} from 'node:crypto';
import {getCACertificates} from 'node:tls';
import {spawn} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {parse} from 'dotenv';
import pg from 'pg';
import {abrirProduccionLectura} from '../production-config.mjs';
import {crearArchivoCifrado,claveLocal} from '../backup/encrypted-archive.mjs';
/** Requiere autorización explícita. El dump cifrado se restaura solo en una base local nueva por nombre+OID. */
assert.equal(process.env.ACTUALIZACION_PRODUCCION_AUTORIZADA,'RESPALDAR_Y_ENSAYAR');
const dir=path.resolve('../.private/actualizacion-20261026');fs.mkdirSync(dir,{recursive:true,mode:0o700});
const remoto=await abrirProduccionLectura({respaldoCompleto:true});
const localCfg=parse(fs.readFileSync('.env'));const localURL=new URL(localCfg.DATABASE_URL);
assert.ok(['localhost','127.0.0.1','[::1]'].includes(localURL.hostname));assert.equal(localURL.pathname,'/sistema_web_final');
const q=s=>'"'+s.replaceAll('"','""')+'"';
async function huella(c){const tablas=(await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;const rows={},seq={};
 for(const {tablename} of tablas){assert.match(tablename,/^[a-z_]+$/);rows[tablename]=(await c.query(`SELECT count(*)::int cantidad,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) huella FROM public.${q(tablename)} t`)).rows[0];}
 for(const {sequencename} of (await c.query("SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows)seq[sequencename]=(await c.query(`SELECT last_value::text,is_called FROM public.${q(sequencename)}`)).rows[0];return {rows,seq};}
let admin,restaurada;
try{
 await remoto.cliente.query("SET LOCAL TIME ZONE 'UTC'");
 const inicial=await huella(remoto.cliente);const snapshot=(await remoto.cliente.query('SELECT pg_export_snapshot() snapshot')).rows[0].snapshot;
 const url=new URL(remoto.configuracion.DATABASE_URL),ca=path.join(dir,'tls-ca.pem');fs.writeFileSync(ca,getCACertificates('default').join('\n'));
 const key=await claveLocal(path.resolve('../.private/production/keys/backup.key'));
 const backup=path.join(dir,'preactualizacion-'+new Date().toISOString().replaceAll(':','-')+'.dump.enc');
 const pgdir='C:/Program Files/PostgreSQL/18/bin/';
 const entorno={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:url.pathname.slice(1),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:'verify-full',PGSSLROOTCERT:ca,PGOPTIONS:'-c default_transaction_read_only=on',PGCONNECT_TIMEOUT:'20'};
 const resultado=await crearArchivoCifrado({pgDump:pgdir+'pg_dump.exe',pgRestore:pgdir+'pg_restore.exe',entorno,destino:backup,key,snapshot});
 const nombre='sistema_web_final_qa_archivo_'+randomUUID().replaceAll('-','');const mantenimiento=new URL(localURL);mantenimiento.pathname='/postgres';
 admin=new pg.Client({connectionString:mantenimiento.toString()});await admin.connect();const ident=(await admin.query("SELECT current_database() db,inet_server_addr()::text host,current_setting('neon.branch_id',true) rama")).rows[0];assert.equal(ident.db,'postgres');assert.ok(['::1/128','127.0.0.1/32'].includes(ident.host));assert.ok(!ident.rama);
 await admin.query('CREATE DATABASE '+q(nombre)+' TEMPLATE template0');const oid=(await admin.query('SELECT oid FROM pg_database WHERE datname=$1',[nombre])).rows[0].oid;
 const destino=new URL(localURL);destino.pathname='/'+nombre;
 const entornoLocal={...process.env,PGHOST:destino.hostname.replace(/^\[|\]$/g,''),PGPORT:destino.port||'5432',PGDATABASE:nombre,PGUSER:decodeURIComponent(destino.username),PGPASSWORD:decodeURIComponent(destino.password),PGOPTIONS:'',PGSSLMODE:'disable'};
 const child=spawn(pgdir+'pg_restore.exe',['--no-owner','--no-privileges','--exit-on-error','--dbname',nombre],{env:entornoLocal,windowsHide:true,stdio:['pipe','ignore','pipe']});let diagnostico='';child.stderr.on('data',b=>{diagnostico+=b;});
 const finished=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error('Restauración no completada; revisar diagnóstico privado')));});void finished.catch(()=>{});
 const data=fs.readFileSync(backup),header=data.subarray(0,20),tag=data.subarray(data.length-16);const decrypt=createDecipheriv('aes-256-gcm',key,header.subarray(8));decrypt.setAAD(header);decrypt.setAuthTag(tag);
 try{await Promise.all([pipeline(fs.createReadStream(backup,{start:20,end:data.length-17}),decrypt,child.stdin),finished]);}catch(e){fs.writeFileSync(path.join(dir,'restauracion-diagnostico.txt'),diagnostico,{mode:0o600});throw e;}
 restaurada=new pg.Client({connectionString:destino.toString()});await restaurada.connect();const identidad=(await restaurada.query('SELECT current_database() db,(SELECT oid FROM pg_database WHERE datname=current_database()) oid')).rows[0];assert.equal(identidad.db,nombre);assert.equal(identidad.oid,oid);await restaurada.query("SET TIME ZONE 'UTC'");assert.deepEqual(await huella(restaurada),inicial);
 const manifiesto={version:'20261026-archivo-v1',fecha:new Date().toISOString(),backup,resultado,rama:remoto.configuracion.NEON_BRANCH_ID,proyecto:remoto.configuracion.NEON_PROJECT_ID,restauracion:{nombre,oid,host:ident.host},huella:inicial,restauracionVerificada:true};
 fs.writeFileSync(path.join(dir,'respaldo-verificado.json'),JSON.stringify(manifiesto,null,2),{mode:0o600});
 console.log({respaldoCifrado:true,integridadGcm:true,restauracionVerificada:true,baseSeparada:nombre,oid,tablasVerificadas:Object.keys(inicial.rows).length});
}finally{await restaurada?.end();await admin?.end();await remoto.cerrar();}
