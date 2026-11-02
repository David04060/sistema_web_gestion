import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from 'dotenv';
import pg from 'pg';
import {test} from 'node:test';
import {verificarConexionLocal} from '../src/config/local.ts';
import {generarToken} from '../src/shared/security/jwt.ts';
test('Consulta institucional ordinaria con escritura separada',async()=>{
 const url=parse(fs.readFileSync('.env')).DATABASE_URL,c=new pg.Client({connectionString:url});await c.connect();
 try{
  await verificarConexionLocal(c,url);let solicitudes=0;
  const usuarios=(await c.query("SELECT u.id::text,u.version_autenticacion,r.nombre rol FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.activo AND r.nombre IN ('Director(a)','Secretaria de Dirección')")).rows;
  const docs=(await c.query("SELECT d.id::text,d.registrado_por_id::text,d.responsable_actual_id::text,r.nombre autor FROM documentos d JOIN usuarios u ON u.id=d.registrado_por_id JOIN roles r ON r.id=u.rol_id JOIN tipos_documentales t ON t.id=d.tipo_documental_id WHERE NOT t.requiere_clave AND lower(btrim(t.nombre))<>'síseve'")).rows;
  for(const u of usuarios){const token=generarToken(u.id,u.version_autenticacion);
   for(const d of docs){const res=await fetch('http://localhost:5173/api/documentos/'+d.id,{headers:{Authorization:'Bearer '+token}});solicitudes++;assert.equal(res.status,200);const detalle=(await res.json()).documento;
    if(d.autor==='Usuario'){assert.equal(detalle.permisos.editar,false);assert.equal(detalle.permisos.anular,false);}
    const pdf=await fetch(`http://localhost:5173/api/documentos/${d.id}/pdf`,{headers:{Authorization:'Bearer '+token}});solicitudes++;assert.equal(pdf.status,200);
    if(d.autor==='Usuario'&&d.responsable_actual_id!==u.id)assert.equal((await pdf.json()).modificar,false);
   }
  }
  console.log({documentosOrdinarios:docs.length,perfiles:usuarios.length,solicitudes});
 }finally{await c.end();}
});
