import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {parse} from 'dotenv';
import pg from 'pg';
import {URL} from 'node:url';
import assert from 'node:assert/strict';
const url=new URL(parse(fs.readFileSync('.env')).DATABASE_URL);assert.equal(url.pathname,'/sistema_web_documental_final');
const c=new pg.Client({connectionString:url.toString(),options:'-c default_transaction_read_only=on'});await c.connect();
try{
 const identidad=(await c.query("SELECT current_database() base,inet_server_addr()::text host,inet_server_port() puerto,(SELECT oid::text FROM pg_database WHERE datname=current_database()) oid,current_schema() esquema")).rows[0];assert.equal(identidad.oid,'98367');
 const funciones=(await c.query("SELECT p.proname,p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY proname")).rows;
 const tablas=(await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(t=>t.tablename);
 const tablasDocs={identidad:['roles','usuarios','oficinas','ambitos_registro','miembros_ambito'],configuracion:['tipos_documentales','unidades_ubicacion'],documentos:['documentos','correlativos_documentales','delegaciones_documento','ubicaciones_documento','documentos_relaciones'],pdf:['documentos_pdf','pdf_cargas','pdf_objetos_pendientes','pdf_eventos'],auditoria:['auditoria_documental','auditoria_configuracion']};
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const entorno={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:'sistema_web_documental_final',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:'disable'};
 const dump=spawnSync('C:/Program Files/PostgreSQL/18/bin/pg_dump.exe',['--schema-only','--no-owner','--no-privileges'],{env:entorno,encoding:'utf8'});if(dump.status!==0)throw Error('No se pudo obtener el esquema instalado');
 fs.mkdirSync('../database/schema',{recursive:true});
 const semillas="\nSET search_path = public;\nINSERT INTO roles(id,codigo) VALUES(1,'SUPERADMINISTRADOR'),(2,'ADMINISTRADOR'),(3,'DIRECTOR'),(4,'SECRETARIA_DIRECCION'),(5,'USUARIO');\nINSERT INTO oficinas(nombre) VALUES('Dirección'),('Mesa de Partes');\nINSERT INTO ambitos_registro(clase) VALUES('COMPARTIDO_DIRECCION');\n";
 fs.writeFileSync('../database/sistema_documental_instalacion.sql','-- DDL real exportado de sistema_web_documental_final. Solo instalación NUEVA vacía.\nBEGIN;\n'+dump.stdout.replace(/\r+\n/g,'\n')+semillas+'COMMIT;\n');
 const grupos=Object.fromEntries([...Object.keys(tablasDocs),'integridad'].map(k=>[k,[]]));
 const partes=dump.stdout.replace(/\r+\n/g,'\n').split(/(?=--\n-- Name: )/);
 const nombres=Object.entries(tablasDocs).flatMap(([modulo,ts])=>ts.map(t=>({modulo,t}))).sort((a,b)=>b.t.length-a.t.length);
 const funcionesModulo={identidad:['validar_usuario_oficina','validar_miembro_ambito'],configuracion:['validar_tipo_documental','validar_unidad_ubicacion'],documentos:['asignar_codigo_documental','validar_documento_actualizacion','auditar_documento','validar_delegacion','aplicar_delegacion','validar_ubicacion','aplicar_ubicacion','validar_relacion','validar_estado_final'],pdf:['validar_pdf_permiso','auditar_pdf']};
 for(const parte of partes){const encontrado=nombres.find(({t})=>new RegExp('Name: '+t+'(?:[ ;_])').test(parte));const funcion=Object.entries(funcionesModulo).find(([,ts])=>ts.some(t=>parte.includes('Name: '+t+'(')));grupos[encontrado?.modulo??funcion?.[0]??'integridad'].push(parte);}
 for(const [modulo,partes] of Object.entries(grupos))fs.writeFileSync('../database/schema/'+modulo+'.schema.sql','-- DOCUMENTACIÓN del catálogo instalado: NO es una migración ni debe ejecutarse.\n'+partes.join(''));
 const restricciones=(await c.query("SELECT conrelid::regclass::text tabla,conname,pg_get_constraintdef(oid) definicion FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname")).rows;
 const triggers=(await c.query("SELECT tgrelid::regclass::text tabla,tgname,pg_get_triggerdef(oid) definicion FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) ORDER BY tgname")).rows;
 fs.writeFileSync('../database/schema/INVENTARIO.md','# Inventario real\n\n'+JSON.stringify(identidad,null,2)+'\n\n## Tablas\n\n'+tablas.map(t=>'- `'+t+'`').join('\n')+'\n\n## Funciones\n\n'+funciones.map(f=>'- `'+f.proname+'`').join('\n')+'\n\n## Triggers\n\n'+triggers.map(t=>'- `'+t.tabla+'.'+t.tgname+'`: `'+t.definicion+'`').join('\n')+'\n\n## Restricciones\n\n'+restricciones.map(t=>'- `'+t.tabla+'.'+t.conname+'`: `'+t.definicion+'`').join('\n')+'\n');
 console.log({identidad,tablas:tablas.length,funciones:funciones.length,triggers:triggers.length,usuarios:(await c.query('SELECT count(*)::int n FROM usuarios')).rows[0].n});
}finally{await c.end();}
