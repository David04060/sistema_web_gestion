import './helpers/exigir-aislamiento.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pool} from '../dist/config/database.js';
import {verificarEntornoPrueba,leerFixtures} from './helpers/entorno-prueba.mjs';
import * as docs from '../dist/modules/documentos/documentos.operaciones.js';
import {crearUnidad} from '../dist/modules/usuarios/administracion.operaciones.js';

test('Delegación: tres roles, con y sin ubicación, cierre e historial conservados',async()=>{
 await verificarEntornoPrueba(pool);const f=leerFixtures();
 try{
 for(const key of ['director','secretaria','usuario'])for(const conUbicacion of [false,true]){
  const actor=f.cuentas[key];
  let d=(await docs.registrar(actor.id,docs.alta.parse({tipo_id:key==='usuario'?f.tipos.usuario:f.tipos.director,clasificacion:'RECIBIDO',asunto:'Delegación sintética '+key, ...(key==='secretaria'?{conservar_en_mesa:true}:{})}))).documento;
  const original=d.situacion;let ruta=null;
  if(conUbicacion){const unidad=await crearUnidad(actor.id,{clase:'Estante',nombre:'Lugar sintético '+key,padre_id:null});d=(await docs.ubicar(actor.id,d.id,{revision:d.revision,unidad_id:unidad.id})).documento;ruta=d.ubicacion.ruta_ubicacion_guardada;}
  for(const keyProhibida of ['superadmin','admin'])await assert.rejects(docs.delegar(f.cuentas[keyProhibida].id,d.id,docs.delegacion.parse({revision:d.revision,nombre:'Persona sintética'})),e=>[403,404].includes(e.status));
  d=(await docs.delegar(actor.id,d.id,docs.delegacion.parse({revision:d.revision,nombre:'Persona sintética'}))).documento;
  assert.equal(d.situacion,'DELEGADO');assert.equal(d.ubicacion,null);
  const lugares=(await pool.query('SELECT vigente,ruta_ubicacion_guardada FROM ubicaciones_documento WHERE documento_id=$1',[d.id])).rows;
  assert.equal(lugares.length,conUbicacion?1:0);if(conUbicacion){assert.equal(lugares[0].vigente,false);assert.equal(lugares[0].ruta_ubicacion_guardada,ruta);}
  const evento=(await pool.query("SELECT anterior,posterior FROM auditoria_documental WHERE documento_id=$1 AND accion='DELEGACION'",[d.id])).rows[0];
  assert.equal(evento.anterior.situacion,key==='director'&&conUbicacion?'GUARDADO_DIRECCION':original);assert.equal(evento.anterior.ruta,ruta);assert.equal(evento.posterior.situacion,'DELEGADO');assert.equal(evento.posterior.ruta,null);
 }
 }finally{await pool.end();}
});
