import fs from 'node:fs';import assert from 'node:assert/strict';import {test} from 'node:test';import {parse} from 'dotenv';import pg from 'pg';
import {verificarConexionLocal} from '../src/config/local.ts';import {generarToken} from '../src/shared/security/jwt.ts';import {dashboardSchema} from '../../frontend/src/features/dashboard/schemas/dashboard.schema.ts';

test('H1/H2: situaciones vigentes, ubicaciones y privacidad local, sin escrituras',async()=>{
 const url=parse(fs.readFileSync('.env')).DATABASE_URL,c=new pg.Client({connectionString:url});await c.connect();
 try{
  await verificarConexionLocal(c,url);let solicitudes=0;
  const usuarios=(await c.query("SELECT u.id::text,u.version_autenticacion,r.nombre rol FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.activo ORDER BY u.id")).rows;
  const perfiles=Object.fromEntries(usuarios.map(u=>[u.rol,u]));
  async function get(rol,path,status=200){solicitudes++;const u=perfiles[rol],r=await fetch('http://localhost:5173'+path,{headers:{Authorization:'Bearer '+generarToken(u.id,u.version_autenticacion)}});assert.equal(r.status,status,path);return r.json();}
  const dir='Director(a)',sec='Secretaria de Dirección';
  for(const rol of [dir,sec]){
   const opciones=await get(rol,'/api/documentos/opciones');assert.ok(opciones.filtros.some(f=>f.archivador_id==='6'&&f.ubicacion==='DIRECCION / Archivador 1'));
   const lista=await get(rol,'/api/documentos?q=OFI2026004&archivador_id=6');assert.equal(lista.total,1);assert.equal(lista.documentos[0].id,'88');assert.equal(lista.documentos[0].entrega.situacion,'GUARDADO_DIRECCION');
   assert.equal((await get(rol,'/api/documentos?q=MEM2026001&archivador_id=5')).total,0);await get(rol,'/api/documentos/81',404);
   assert.equal((await get(rol,'/api/documentos/83')).documento.entrega.situacion,'ENTREGADO');
  }
  assert.equal((await get('Usuario','/api/documentos?q=MEM2026001&archivador_id=5')).total,1);
  assert.equal((await get('Usuario','/api/documentos?q=OFI2026004&archivador_id=6')).total,0);await get('Usuario','/api/documentos/88',404);
  assert.ok(!(await get('Usuario','/api/documentos/opciones')).filtros.some(f=>f.archivador_id==='6'||f.archivador_id==='7'));
  for(const u of usuarios){
   const panel=dashboardSchema.parse(await get(u.rol,'/api/dashboard'));
   if(u.rol==='Administrador'){assert.equal(panel.recientes.length,0);continue;}
   const docs=(await c.query(`SELECT d.id::text,d.codigo,d.activo,d.clasificacion_registro,coalesce(f.situacion,CASE WHEN p.documento_id IS NOT NULL THEN 'DELEGADO' ELSE 'SIN_DELEGACION' END) situacion
    FROM documentos d JOIN tipos_documentales t ON t.id=d.tipo_documental_id JOIN usuarios a ON a.id=d.registrado_por_id JOIN roles r ON r.id=a.rol_id
    LEFT JOIN entregas_secretaria f ON f.documento_id=d.id LEFT JOIN delegaciones_personales p ON p.documento_id=d.id
    WHERE NOT t.requiere_clave AND lower(btrim(t.nombre))<>'síseve' AND (d.registrado_por_id=$1 OR ($2='Director(a)' AND r.nombre='Secretaria de Dirección') OR ($2='Secretaria de Dirección' AND r.nombre='Director(a)'))`,[u.id,u.rol])).rows;
   for(const estado of panel.estados)assert.equal(estado.total,docs.filter(d=>d.situacion===estado.clave).length);
   assert.equal(panel.indicadores.find(i=>i.clave==='documentos').total,docs.length);
   assert.equal(panel.indicadores.find(i=>i.clave==='delegados').total,docs.filter(d=>d.activo&&d.situacion==='DELEGADO').length);
   for(const e of [...panel.recientes,...panel.pendientes]){const d=docs.find(d=>d.id===e.id);assert.ok(d);assert.equal(e.estado,d.situacion);assert.equal(e.clasificacion_registro,d.clasificacion_registro);assert.equal(e.activo,d.activo);}
   for(const o of panel.operaciones)assert.equal(o.total,docs.filter(d=>d.activo&&d.situacion===(o.clave==='decision'?'PENDIENTE_DECISION':'DELEGADO')).length);
   assert.ok(panel.operaciones.every(o=>['decision','entrega'].includes(o.clave)));assert.ok(!JSON.stringify(panel).includes('EN_TRASLADO'));
   if(u.rol==='Usuario'){assert.deepEqual(panel.operaciones,[]);assert.deepEqual(panel.pendientes,[]);}
  }
  console.log({solicitudes,base:'sistema_web_final',proxy:'localhost:5173',sinEscrituras:true});
 }finally{await c.end();}
});
