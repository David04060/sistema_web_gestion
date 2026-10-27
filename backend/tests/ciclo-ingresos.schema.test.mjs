import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reingresoSchema, evidenciaSchema, concluirSchema, invalidarSchema, paginaSchema } from '../dist/modules/ingresos/ingresos.schema.js';

test('Ciclo: presentación nueva exige confirmación actual, propósito y antecedente sin aceptar identidad o fechas',()=>{
 const datos={presentante:'QA',procedencia:'Mesa QA',proposito:'Nueva gestión',ingreso_anterior_id:'9007199254740993',confirmar_presentacion:true};
 assert.equal(reingresoSchema.parse(datos).ingreso_anterior_id,datos.ingreso_anterior_id);
 for(const extra of [{documento_id:'2'},{codigo:'Otro'},{fecha_presentacion:'2026-01-01T00:00:00Z'},{confirmar_presentacion:false},{proposito:' '}])
  assert.equal(reingresoSchema.safeParse({...datos,...extra}).success,false);
});
test('Ciclo: evidencia y desenlaces tienen contratos separados sin cambios de custodia o estado',()=>{
 assert.equal(evidenciaSchema.safeParse({descripcion:'Resultado',confirmar_tenencia:true}).success,true);
 assert.equal(evidenciaSchema.safeParse({descripcion:'Resultado',confirmar_tenencia:false}).success,false);
 assert.equal(concluirSchema.safeParse({motivo:'Concluir',evidencia_id:'1',confirmar:true}).success,true);
 assert.equal(concluirSchema.safeParse({motivo:'Concluir',confirmar:true}).success,false);
 assert.equal(invalidarSchema.safeParse({motivo:'Error de incorporación',confirmar:true,estado_tramite:'INVALIDADO'}).success,false);
});
test('Ciclo: paginación acotada antes de consultas y totales',()=>{
 assert.deepEqual(paginaSchema.parse({}),{pagina:1,limite:10});
 for(const datos of [{limite:51},{pagina:0},{pagina:'1 OR 1=1'},{limite:1.5}]) assert.equal(paginaSchema.safeParse(datos).success,false);
});
