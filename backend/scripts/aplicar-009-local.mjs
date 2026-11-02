import fs from 'node:fs';
import {parse} from 'dotenv';
import pg from 'pg';
import {verificarConexionLocal} from '../src/config/local.ts';
const url=parse(fs.readFileSync('.env')).DATABASE_URL,c=new pg.Client({connectionString:url});
try{
 await c.connect();const identidad=await verificarConexionLocal(c,url);
 const antes=(await c.query("SELECT id::text,codigo,registrado_por_id::text,asunto,archivador_id::text,estado_tramite FROM documentos WHERE id IN (106,107,108,109) ORDER BY id")).rows;
 if(antes.length!==4)throw Error('Fixtures incompletos');
 await c.query(fs.readFileSync('scripts/sql/009-cancelar-transferencia-local.sql','utf8'));
 const despues=(await c.query("SELECT id::text,codigo,registrado_por_id::text,responsable_actual_id::text,asunto,archivador_id::text,estado_tramite FROM documentos WHERE id IN (106,107,108,109) ORDER BY id")).rows;
 for(let i=0;i<4;i++){const {responsable_actual_id,...resto}=despues[i];if(responsable_actual_id!=='32'||JSON.stringify(resto)!==JSON.stringify(antes[i]))throw Error('Conservación posterior incompatible');}
 console.log(JSON.stringify({base:identidad.base,documentosCompensados:despues.map(d=>d.id),identidadCodigoAutoriaUbicacionEstadoConservada:true,eventosConservados:(await c.query('SELECT count(*)::int n FROM delegaciones_documentales')).rows[0].n}));
}finally{await c.end();}
