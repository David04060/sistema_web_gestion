import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from 'dotenv';
import pg from 'pg';
import {test} from 'node:test';
import {verificarConexionLocal} from '../src/config/local.ts';
import {generarToken} from '../src/shared/security/jwt.ts';
test('PDF: Dirección y Secretaría responsables vigentes en fixtures locales',async()=>{
 const url=parse(fs.readFileSync('.env')).DATABASE_URL,c=new pg.Client({connectionString:url});await c.connect();
 try{
  await verificarConexionLocal(c,url);
  const casos=(await c.query(`SELECT d.id::text,d.codigo,f.situacion,u.id::text actor,u.version_autenticacion,r.nombre rol
   FROM documentos d JOIN usuarios u ON u.id=d.responsable_actual_id JOIN roles r ON r.id=u.rol_id
   JOIN entregas_secretaria f ON f.documento_id=d.id WHERE d.id IN (106,107,108,109,122,123,124,125,126,127,128)
   AND d.activo AND d.estado_tramite IN ('RECIBIDO','PENDIENTE_DECISION') AND r.nombre IN ('Director(a)','Secretaria de Dirección') ORDER BY d.id`)).rows;
  assert.ok(casos.some(d=>d.codigo==='INF2026072'));assert.ok(casos.some(d=>d.rol==='Secretaria de Dirección'));
  for(const d of casos){
   const r=await fetch(`http://localhost:5173/api/documentos/${d.id}/pdf`,{headers:{Authorization:'Bearer '+generarToken(d.actor,d.version_autenticacion)}});
   assert.equal(r.status,200,d.codigo);assert.equal((await r.json()).modificar,true,d.codigo);
  }
  console.log({casos:casos.map(({codigo,situacion,rol})=>({codigo,situacion,rol})),permisoCargaConfirmado:true});
  const directora=(await c.query("SELECT u.id::text,u.version_autenticacion FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE r.nombre='Director(a)' AND u.activo LIMIT 1")).rows[0];
  const fixture=casos.find(d=>d.codigo==='INF2026070');assert.ok(fixture);
  const headers={Authorization:'Bearer '+generarToken(directora.id,directora.version_autenticacion),Origin:'http://localhost:5173','Content-Type':'application/json'};
  const lectura=await fetch(`http://localhost:5173/api/documentos/${fixture.id}/pdf`,{headers});assert.equal(lectura.status,200);assert.equal((await lectura.json()).modificar,false);
  const carga=await fetch(`http://localhost:5173/api/documentos/${fixture.id}/pdf/cargas`,{method:'POST',headers,body:JSON.stringify({nombre:'qa-denegado.pdf',tamano:100,mime:'application/pdf',revision:null})});assert.equal(carga.status,403);
  console.log({documentoSecretaria:fixture.codigo,directoraConsulta:true,directoraModifica:false,cargaDirecta:403});
 }finally{await c.end();}
});
