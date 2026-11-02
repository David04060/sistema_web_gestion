import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import pg from 'pg';
import { validarUrlLocal,verificarConexionLocal } from '../dist/config/local.js';

// Solo diagnóstico: no ejecuta DDL, migraciones, login ni escrituras de auditoría.
const privado=parse(readFileSync('.env'));
const conexion=process.env.DATABASE_URL??privado.DATABASE_URL;
validarUrlLocal(conexion);
assert.notEqual(process.env.RENDER,'true');
assert.notEqual(process.env.NODE_ENV,'production');
process.env.DATABASE_URL=conexion;
process.env.PGOPTIONS='-c default_transaction_read_only=on';
const c=new pg.Client({connectionString:conexion,options:'-c default_transaction_read_only=on'});
let pool;
try {
    await c.connect();await c.query('BEGIN READ ONLY');
    console.log('identidad',await verificarConexionLocal(c,conexion));
    console.log('soloLectura',(await c.query('SHOW transaction_read_only')).rows);
    console.log('objetos005',(await c.query(`SELECT n.nombre,to_regclass('public.'||n.nombre)::text existente FROM unnest($1::text[]) n(nombre)`,[['pdf_cargas','pdf_objetos','documentos_pdf','pdf_eventos','pdf_eventos_id_seq','pdf_objetos_limpieza','pdf_cargas_actor','pdf_eventos_documento']])).rows);
    console.log('columnasDependencias',(await c.query(`SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND (table_name IN ('documentos','usuarios') AND column_name='id') ORDER BY table_name`)).rows);
    console.log('clavesDependencias',(await c.query(`SELECT conrelid::regclass::text tabla,conname,pg_get_constraintdef(oid) definicion FROM pg_constraint WHERE conrelid IN ('public.documentos'::regclass,'public.usuarios'::regclass) AND contype='p'`)).rows);
    console.log('roles',(await c.query(`SELECT rolname,rolsuper,has_schema_privilege(rolname,'public','USAGE') uso,has_schema_privilege(rolname,'public','CREATE') crear FROM pg_roles WHERE rolname=current_user OR rolname='sistema_web_app' ORDER BY rolname`)).rows);
    console.log('conflictosTipos',(await c.query(`SELECT typname FROM pg_type WHERE typnamespace='public'::regnamespace AND typname=ANY($1::text[])`,[['pdf_cargas','pdf_objetos','documentos_pdf','pdf_eventos']])).rows);
    console.log('conflictosIndicesImplicitos',(await c.query(`SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[])`,[['pdf_cargas_pkey','pdf_cargas_temporal_key','pdf_cargas_definitiva_key','pdf_objetos_pkey','documentos_pdf_pkey','documentos_pdf_revision_key','documentos_pdf_clave_key','pdf_eventos_pkey']])).rows);
    console.log('eventTriggersDDL',(await c.query('SELECT evtname,evtevent,evtenabled FROM pg_event_trigger')).rows);
    console.log('trigger004',(await c.query(`SELECT pg_get_triggerdef(oid) definicion FROM pg_trigger WHERE tgrelid='public.documentos'::regclass AND tgname='aa_documentos_clasificacion_registro'`)).rows);
    console.log('dependenciasDDL',(await c.query(`SELECT to_regprocedure('pg_catalog.clock_timestamp()')::text reloj,has_database_privilege(current_user,current_database(),'CONNECT') conectar,(SELECT count(*)::int FROM documentos) documentos`)).rows);
    const id=process.argv[2]??'5';assert.match(id,/^[1-9][0-9]*$/);
    const actor=(await c.query(`SELECT u.id::text,u.version_autenticacion FROM documentos d JOIN usuarios u ON u.id=d.registrado_por_id WHERE d.id=$1 AND u.activo`,[id])).rows[0];
    await c.query('ROLLBACK');
    const db=await import('../dist/config/database.js');pool=db.pool;
    pool.options.options='-c default_transaction_read_only=on';
    const {pdf}=await import('../dist/modules/documentos-pdf/pdf.service.js');
    const {crearAlmacenR2}=await import('../dist/modules/documentos-pdf/pdf.storage.js');
    console.log('variablesR2',Object.fromEntries(['R2_PDF_ACCOUNT_ID','R2_PDF_BUCKET','R2_PDF_ACCESS_KEY_ID','R2_PDF_SECRET_ACCESS_KEY'].map(k=>[k,!!process.env[k]])));
    try{crearAlmacenR2();console.log('configR2','disponible');}catch(e){console.log('configR2',{status:e.status,mensaje:e.message});}
    if(actor){
        try{console.log('servicioGET',await pdf.consultar(actor.id,id));}
        catch(e){console.log('errorRealBackend',{codigo:e.code??null,status:e.status??500,mensaje:e.code==='42P01'?e.message:(e.status?e.message:'Error de base de datos; detalle privado omitido')});}
        // Token efímero de diagnóstico, solo en memoria: no se imprime, no cambia cuentas ni privilegios.
        const {generarToken}=await import('../dist/shared/security/jwt.js');
        const token=generarToken(actor.id,actor.version_autenticacion);
        for(const base of ['http://localhost:5173','http://127.0.0.1:3000']){
            try{const r=await fetch(`${base}/api/documentos/${id}/pdf`,{headers:{Authorization:`Bearer ${token}`},signal:globalThis.AbortSignal.timeout(5000)});console.log('http',{base,status:r.status,cuerpo:await r.json()});}
            catch{console.log('http',{base,disponible:false});}
        }
    }else console.log('reproduccion','Documento inexistente o autor inactivo; no se suplanta otra cuenta');
}finally{if(pool)await pool.end();await c.end();}
