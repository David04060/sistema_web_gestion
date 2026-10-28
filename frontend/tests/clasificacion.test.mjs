import assert from 'node:assert/strict';
import {test} from 'node:test';
import {clasificacionRegistroSchema} from '../src/features/documentos/schemas/documentos.schema.ts';
import {etiquetaClasificacion} from '../src/features/documentos/clasificacion.ts';
import {dashboardSchema} from '../src/features/dashboard/schemas/dashboard.schema.ts';

test('Clasificación del registro es independiente de los cinco estados y conserva antecedentes nulos',()=>{
 assert.equal(etiquetaClasificacion('RECIBIDO'),'Recibido');
 assert.equal(etiquetaClasificacion('EMITIDO'),'Emitido');
 assert.equal(etiquetaClasificacion(null),'Sin clasificación');
 for(const value of [undefined,null,'','EN_TRASLADO','CANCELADO','recibido'])assert.equal(clasificacionRegistroSchema.safeParse(value).success,false);
});
test('Dashboard admite solo las dos rutas explícitas del formulario compartido',()=>{
 const panel={alcance:'personal',actualizado:new Date().toISOString(),indicadores:[],estados:[],operaciones:[],recientes:[],pendientes:[],accesos:[]};
 for(const value of ['RECIBIDO','EMITIDO'])assert.ok(dashboardSchema.safeParse({...panel,accesos:[{etiqueta:'Registrar documento',ruta:'/documentos/nuevo?clasificacion='+value}]}).success);
 assert.equal(dashboardSchema.safeParse({...panel,accesos:[{etiqueta:'Entrada inválida',ruta:'/documentos/nuevo?clasificacion=INVALIDA'}]}).success,false);
});
