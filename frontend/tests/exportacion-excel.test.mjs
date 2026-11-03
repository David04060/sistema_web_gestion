/* global AbortController */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'vite';
const r=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:'src/api/client.ts',formats:['es']}}});
const chunk=(Array.isArray(r)?r:[r]).flatMap(v=>v.output).find(c=>c.type==='chunk'&&c.isEntry);const api=await import('data:text/javascript;base64,'+Buffer.from(chunk.code).toString('base64'));

test('Descarga Excel: Bearer, contrato binario, conteo, estado y sin repetir una generación fallida',async()=>{
 assert.equal(typeof api.apiArchivo,'function');const fetchAnterior=globalThis.fetch;let llamadas=0,peticion,recibiendo=false;
 try{
  globalThis.fetch=async(url,opciones)=>{llamadas++;peticion={url,opciones};return new Response(new Uint8Array([80,75,3,4]),{headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','X-Export-Total':'0'}});};
  const archivo=await api.apiArchivo('/api/documentos/exportar-excel?anio=2026&mes=11','sesion',new AbortController().signal,()=>{recibiendo=true;});
  assert.equal(archivo.total,0);assert.equal(archivo.blob.size,4);assert.equal(recibiendo,true);assert.equal(peticion.opciones.headers.get('Authorization'),'Bearer sesion');assert.equal(peticion.opciones.cache,'no-store');assert.equal(llamadas,1);
  globalThis.fetch=async()=>{llamadas++;return new Response('{"error":"SQL privado"}',{status:500});};
  await assert.rejects(api.apiArchivo('/api/documentos/exportar-excel?anio=2026&mes=11','sesion',new AbortController().signal),e=>e.status===500&&!e.message.includes('SQL privado'));assert.equal(llamadas,2);
 }finally{globalThis.fetch=fetchAnterior;}
});

test('Excel: rechazo, sesión revocada, cancelación y respuesta incompatible no anuncian descarga',async()=>{
 assert.equal(typeof api.apiArchivo,'function');const fetchAnterior=globalThis.fetch;let revocada=false;const cerrar=api.suscribirNoAutorizado(t=>{revocada=t==='sesion';});
 try{
  globalThis.fetch=async()=>new Response('{"error":"Límite de exportación"}',{status:422});await assert.rejects(api.apiArchivo('/api/x','sesion',new AbortController().signal),/Límite de exportación/);
  globalThis.fetch=async()=>new Response('{"error":"Hay una exportación en curso. Espera."}',{status:429});await assert.rejects(api.apiArchivo('/api/x','sesion',new AbortController().signal),/exportación en curso/);
  globalThis.fetch=async()=>new Response('',{status:401});await assert.rejects(api.apiArchivo('/api/x','sesion',new AbortController().signal));assert.equal(revocada,true);
  globalThis.fetch=async()=>new Response('HTML',{headers:{'content-type':'text/html'}});await assert.rejects(api.apiArchivo('/api/x','sesion',new AbortController().signal));
  const c=new AbortController();c.abort();globalThis.fetch=async()=>{throw c.signal.reason;};await assert.rejects(api.apiArchivo('/api/x','sesion',c.signal));
 }finally{cerrar();globalThis.fetch=fetchAnterior;}
});
