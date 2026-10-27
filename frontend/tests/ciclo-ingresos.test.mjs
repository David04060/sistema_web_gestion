import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'vite';
import { historiaSchema } from '../src/features/ingresos/schemas/ingresos.schema.ts';
const result=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:'src/features/ingresos/api/ingresos.api.ts',formats:['es']}}});
const chunk=(Array.isArray(result)?result[0]:result).output.find(c=>c.type==='chunk'&&c.isEntry);
const api=await import('data:text/javascript;base64,'+Buffer.from(chunk.code).toString('base64'));
const id='9007199254740993';
test('Ciclo: consulta distingue vigente nulo de históricos y conserva capacidades cerradas',()=>{
 const h=historiaSchema.parse({ingreso:null,ingresos:[],total:0,pagina:1,limite:10,capacidades:{ciclo_ordinario:true,continuar:false,evidencia:false,concluir:false,invalidar:false,reingresar:false,relevos:false,sustituciones:false}});
 assert.equal(h.ingreso,null);assert.equal(h.capacidades.relevos,false);
});
test('Ciclo: acciones específicas conservan bigint, confirmaciones y autenticación',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({documento_id:id,ingreso_id:id}));};
 try{
  for(const accion of ['continuaciones','evidencias','conclusion','invalidacion','reingresos'])await api.operar('jwt-qa',id,id,accion,{confirmar:true});
  assert.equal(calls.length,5);
  for(const [i,accion] of ['continuaciones','evidencias','conclusion','invalidacion','reingresos'].entries()){
   assert.ok(calls[i].url.endsWith(accion==='reingresos'?`/documentos/${id}/reingresos`:`/documentos/${id}/ingresos/${id}/${accion}`));
   assert.equal(calls[i].options.headers.get('Authorization'),'Bearer jwt-qa');
   assert.equal(JSON.parse(calls[i].options.body).confirmar,true);
  }
 }finally{globalThis.fetch=original;}
});
test('Ciclo: 409 conserva el conflicto público y no repite una escritura',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:'La evidencia ya no está vigente'}),{status:409});};
 try{await assert.rejects(api.operar('jwt-qa',id,id,'conclusion',{motivo:'QA',evidencia_id:id,confirmar:true}),/evidencia/);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
