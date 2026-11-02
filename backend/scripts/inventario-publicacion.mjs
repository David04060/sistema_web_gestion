import fs from 'node:fs';
import {parse} from 'dotenv';
import {abrirProduccionLectura} from './production-config.mjs';
const s=await abrirProduccionLectura({respaldoCompleto:true});
try{
 const migraciones=(await s.cliente.query('SELECT nombre,sha256 FROM migraciones_aplicacion ORDER BY nombre')).rows;
 const funciones=(await s.cliente.query("SELECT p.proname,pg_get_functiondef(p.oid) definicion FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('fn_documentos_proteger_integridad','fn_documento_permisos_contenido')")).rows;
 fs.mkdirSync('.private/publicacion-final',{recursive:true});fs.writeFileSync('.private/publicacion-final/esquema-production.json',JSON.stringify({migraciones,funciones},null,2));
 const tablas=(await s.cliente.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(t=>t.tablename);
 console.log({identidad:s.identidad,migraciones:migraciones.map(m=>m.nombre),funciones:funciones.map(f=>f.proname),tablas});
 for(const archivo of ['../.private/production/render.env','../.private/render/render-qa.env'])if(fs.existsSync(archivo))console.log({archivo,variables:Object.keys(parse(fs.readFileSync(archivo)))});
}finally{await s.cerrar();}
