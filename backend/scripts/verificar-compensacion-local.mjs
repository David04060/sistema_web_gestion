import fs from 'node:fs';
import {parse} from 'dotenv';
import pg from 'pg';
import assert from 'node:assert/strict';
import {verificarConexionLocal} from '../src/config/local.ts';
const url=parse(fs.readFileSync('.env')).DATABASE_URL,c=new pg.Client({connectionString:url});
try{
 await c.connect();await verificarConexionLocal(c,url);
 const funciones=(await c.query("SELECT proname,prosrc FROM pg_proc WHERE oid IN ('public.fn_documentos_proteger_integridad()'::regprocedure,'public.fn_documental_validar_circulacion()'::regprocedure,'public.fn_documento_permisos_contenido(bigint,bigint)'::regprocedure)")).rows;
 assert.equal(funciones.length,3);for(const f of funciones)assert.ok(!f.prosrc.includes('delegaciones_documentales'));
 const triggers=(await c.query("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid='public.delegaciones_documentales'::regclass AND NOT tgisinternal")).rows[0].n;assert.equal(triggers,0);
 const acceso=(await c.query("SELECT has_table_privilege('sistema_web_app','public.delegaciones_documentales','SELECT') lectura,has_table_privilege('sistema_web_app','public.delegaciones_documentales','INSERT') escritura")).rows[0];assert.equal(acceso.lectura,false);assert.equal(acceso.escritura,false);
 const fixtures=(await c.query('SELECT id::text,responsable_actual_id::text FROM documentos WHERE id IN (106,107,108,109) ORDER BY id')).rows;assert.equal(fixtures.length,4);assert.ok(fixtures.every(d=>d.responsable_actual_id==='32'));
 console.log({funcionesRestauradas:funciones.map(f=>f.proname),triggersTransferencia:triggers,accesoTablaHistorica:acceso,fixtures});
}finally{await c.end();}
