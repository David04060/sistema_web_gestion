import './helpers/exigir-aislamiento.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as dashboard from '../dist/modules/dashboard/dashboard.documental.js';
import {pool} from '../dist/config/database.js';

test('Estadísticas reales: cinco roles, privacidad administrativa, ámbitos disjuntos y meses de Perú', async () => {
 const c=await pool.connect();
 try {
  await c.query('BEGIN');
  await c.query('CREATE TEMP TABLE usuarios(id bigint,rol_id smallint,activo boolean,nombre text,apellido text) ON COMMIT DROP');
  await c.query('CREATE TEMP TABLE roles(id smallint,codigo text) ON COMMIT DROP');
  await c.query('CREATE TEMP TABLE oficinas(id bigint,activa boolean) ON COMMIT DROP');
  await c.query('CREATE TEMP TABLE documentos(id bigint,ambito_id bigint,registrado_por bigint,situacion text,tipo_nombre_guardado text,codigo_visible text,asunto text,creado_en timestamptz) ON COMMIT DROP');
  await c.query("INSERT INTO roles VALUES(1,'SUPERADMINISTRADOR'),(2,'ADMINISTRADOR'),(3,'DIRECTOR'),(4,'SECRETARIA_DIRECCION'),(5,'USUARIO')");
  await c.query("INSERT INTO usuarios VALUES(1,1,true,'Privado','No revelar'),(2,2,true,'Admin',''),(3,3,true,'Dirección',''),(4,4,true,'Secretaría',''),(5,5,true,'Personal',''),(6,5,false,'Otra','')");
  await c.query('INSERT INTO oficinas VALUES(1,true),(2,true),(3,false)');
  await c.query(`INSERT INTO documentos VALUES
   (1,10,4,'PENDIENTE_DIRECCION','Informe','I1','Compartido A','2026-11-01T04:30:00Z'),
   (2,10,4,'EN_MESA_DE_PARTES','Oficio','O1','Compartido B','2026-11-01T05:00:00Z'),
   (3,20,5,'PERSONAL','Informe','I2','Personal propio','2026-10-20T12:00:00Z'),
   (4,30,6,'PERSONAL','Solicitud','S1','Personal ajeno','2026-11-02T12:00:00Z'),
   (5,20,5,'ANULADO','Informe','I3','Anulado privado','2026-11-02T13:00:00Z'),
   (6,10,3,'GUARDADO_DIRECCION','Informe','I4','Compartido C','2026-11-03T12:00:00Z'),
   (7,20,5,'DELEGADO','Oficio','O2','Fuera del periodo','2024-01-01T12:00:00Z')`);
  const referencia=new Date('2026-11-15T12:00:00Z');
  const leer=rol=>dashboard.consultarDashboard(c,{id:String(rol),rol_id:rol,oficina_id:rol===3?'1':rol===4?'2':null,ambito_id:[3,4].includes(rol)?'10':rol===5?'20':null,activo:true},referencia);
  const admin=await leer(2);
  assert.equal(admin.usuarios,5);
  assert.equal('documentos' in admin,false);
  assert.equal('grupos_documentales' in admin.estadisticas,false);
  assert.equal(admin.estadisticas.administracion.cuentas_por_rol.some(r=>r.etiqueta==='Superadministrador'),false);
  assert.deepEqual(admin.estadisticas.administracion.actividad_cuentas,[{etiqueta:'Activas',total:4},{etiqueta:'Inactivas',total:1}]);
  assert.ok(!JSON.stringify(admin).includes('Privado'));
  const usuario=await leer(5),personal=usuario.estadisticas.grupos_documentales[0];
  assert.equal(personal.total,2);assert.equal(personal.vigentes,2);assert.equal(personal.anulados,0);
  assert.deepEqual(personal.tipos.map(t=>[t.etiqueta,t.total]),[['Informe',1],['Oficio',1]]);
  assert.equal(personal.meses.length,12);assert.equal(personal.meses[0].mes,'2025-12');
  assert.equal(personal.meses.find(m=>m.mes==='2026-10').total,1);
  assert.equal(personal.meses.find(m=>m.mes==='2026-11').total,0);
  assert.equal(usuario.recientes.length,2);
  const secretaria=await leer(4),compartido=secretaria.estadisticas.grupos_documentales[0];
  assert.equal(compartido.total,3);assert.equal(compartido.meses.find(m=>m.mes==='2026-10').total,1);assert.equal(compartido.meses.find(m=>m.mes==='2026-11').total,2);
  assert.equal(compartido.situaciones.find(s=>s.etiqueta==='PENDIENTE_DIRECCION').total,1);
  const direccion=await leer(3),grupos=direccion.estadisticas.grupos_documentales;
  assert.deepEqual(grupos.map(g=>g.total),[3,3]);
  assert.equal(grupos.reduce((n,g)=>n+g.total,0),6);
  const superadmin=await leer(1),global=superadmin.estadisticas.grupos_documentales[0];
  assert.equal(superadmin.usuarios,6);assert.equal(global.total,7);assert.equal(global.vigentes,6);assert.equal(global.anulados,1);
  assert.equal(global.meses.find(m=>m.mes==='2026-11').anulados,1);
  assert.equal(superadmin.estadisticas.zona_horaria,'America/Lima');
  assert.equal(superadmin.estadisticas.periodo.desde,'2025-12-01T05:00:00.000Z');
  await c.query('DELETE FROM pg_temp.documentos');
  const vacio=(await leer(5)).estadisticas.grupos_documentales[0];
  assert.equal(vacio.total,0);assert.deepEqual(vacio.tipos,[]);assert.deepEqual(vacio.situaciones,[]);
  assert.equal(vacio.meses.length,12);assert.ok(vacio.meses.every(m=>m.total===0&&m.anulados===0));
  // Un Administrador no debe ni consultar documentos; su rama funciona sin esa tabla.
  await c.query('DROP TABLE pg_temp.documentos');
  await assert.doesNotReject(leer(2));
 } finally {await c.query('ROLLBACK');c.release();await pool.end();}
});
