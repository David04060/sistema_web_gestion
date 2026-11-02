import fs from 'node:fs';
import {parse} from 'dotenv';
import pg from 'pg';
import {URL} from 'node:url';
const anterior=parse(fs.readFileSync('.env')).DATABASE_URL,url=new URL(anterior);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Solo local');url.pathname='/sistema_web_documental_final';
const c=new pg.Client({connectionString:url.toString()});await c.connect();
try{
 const i=(await c.query("SELECT current_database() base,inet_server_addr()::text host,(SELECT oid::text FROM pg_database WHERE datname=current_database()) oid,current_schema() esquema")).rows[0];if(i.base!=='sistema_web_documental_final'||i.oid!=='98367'||i.esquema!=='public'||!['::1/128','127.0.0.1/32'].includes(i.host))throw Error('Destino distinto');
 const funcion=async n=>(await c.query('SELECT pg_get_functiondef($1::regprocedure) sql',[n+'()'])).rows[0].sql.trimEnd()+';\n';
 let documento=await funcion('validar_documento_actualizacion');
 documento=documento.replace("(OLD.situacion='PERSONAL' AND NEW.situacion IN ('DELEGADO','ANULADO')))","(OLD.situacion='PERSONAL' AND NEW.situacion IN ('DELEGADO','ANULADO')) OR (OLD.situacion='GUARDADO_DIRECCION' AND NEW.situacion='ANULADO'))");
 let pdf=await funcion('auditar_pdf');pdf=pdf.replace('ON CONFLICT DO NOTHING','ON CONFLICT(clave_r2) DO UPDATE SET limpiar_desde=least(pdf_objetos_pendientes.limpiar_desde,EXCLUDED.limpiar_desde),eliminado_en=NULL');
 let campo=await funcion('registrar_cambio_nombre_campo');campo=campo.replace('IF rol NOT IN (1,2) OR', 'IF coalesce(rol NOT IN (1,2),true) OR');
 if(!documento.includes("OLD.situacion='GUARDADO_DIRECCION' AND NEW.situacion='ANULADO'"))throw Error('Función instalada inesperada');
 const sql="BEGIN;\nSET LOCAL lock_timeout='5s';\nDO $$ BEGIN IF current_database()<>'sistema_web_documental_final' OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL THEN RAISE EXCEPTION 'Se requiere base nueva local'; END IF; END $$;\nALTER TABLE public.pdf_cargas ADD COLUMN revision_esperada uuid;\n"+documento+'\n'+pdf+'\n'+campo+'\nCOMMIT;\n';
 fs.mkdirSync('../database/changes',{recursive:true});fs.writeFileSync('../database/changes/001-ajustes-integracion-local.sql',sql);
 const usuariosAntes=(await c.query('SELECT count(*)::int n FROM usuarios')).rows[0].n;
 await c.query(sql);if((await c.query('SELECT count(*)::int n FROM usuarios')).rows[0].n!==usuariosAntes)throw Error('Cuentas alteradas');
 let env=fs.readFileSync('.env','utf8');env=env.replace(/^DATABASE_URL=.*$/m,'DATABASE_URL='+url.toString());
 if(/^R2_PDF_PREFIX=/m.test(env))env=env.replace(/^R2_PDF_PREFIX=.*$/m,'R2_PDF_PREFIX=qa/pdf-documental-nuevo/');else env+='\nR2_PDF_PREFIX=qa/pdf-documental-nuevo/\n';
 fs.writeFileSync('.env',env);console.log({identidad:i,incremental:'database/changes/001-ajustes-integracion-local.sql',cuentasCreadas:0,conexionLocalActualizada:true});
}finally{await c.end();}
