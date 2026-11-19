import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import process from 'node:process';
import {build} from 'vite';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
const result=await build({configFile:false,logLevel:'silent',plugins:[{name:'contrato-documental',resolveId(i){if(i==='virtual:documental')return '\0virtual:documental';},load(i){if(i==='\0virtual:documental')return ['src/api/documental.ts','src/features/usuarios/components/TipoDocumentalForm.tsx','src/lib/perfiles.ts','src/lib/historialDocumental.ts','src/features/documentos/components/DestinoDocumental.tsx','src/features/documentos/components/ControlesPdf.tsx'].map(p=>`export * from '${process.cwd().replaceAll('\\','/')}/${p}';`).join('\n');}}],build:{ssr:true,write:false,minify:false,rollupOptions:{input:'virtual:documental',preserveEntrySignatures:'strict',output:{format:'es',codeSplitting:false}}}});
const chunk=(Array.isArray(result)?result:[result]).flatMap(r=>r.output).find(c=>c.type==='chunk'&&c.isEntry);
mkdirSync('.private/render-tipos',{recursive:true});
const file=resolve('.private/render-tipos/entrada.mjs');writeFileSync(file,chunk.code);
const m=await import(pathToFileURL(file).href);
const doc={id:'9007199254740993',ambito_id:'20',tipo_id:'9007199254740994',registrado_por:'8',registrado_por_nombre:'Nombre de contrato',tipo_nombre_guardado:'Informe histórico',clasificacion:'RECIBIDO',asunto:'Prueba de contrato en memoria',remitente:null,observaciones:null,codigo_visible:'INF2026001',situacion:'PERSONAL',revision:'1',creado_en:'2026-11-01T12:00:00Z',actualizado_en:'2026-11-01T12:00:00Z'};
const opciones={ambito_id:'20',tipos:[],unidades:[],destinatarios:[{id:'90',nombre:'Persona elegible',oficina_id:'1'},{id:'91',nombre:'Otra oficina',oficina_id:'2'}],oficinas:[{id:'1',nombre:'Oficina elegible'},{id:'2',nombre:'Otra oficina'},{id:'3',nombre:'Sin personas'}]};
test('Los contratos documentales nuevos conservan bigint como texto y exigen capacidades backend',()=>{
 assert.equal(m.documentoSchema.parse(doc).id,doc.id);assert.equal(m.documentoSchema.safeParse({...doc,tipo_id:123}).success,false);
 const permisos={relacionar:true,corregir:false,anular:false,delegar:false,ubicar:false,pdf:false};
 const d=m.detalleSchema.parse({documento:{...doc,delegacion:null,ubicacion:null,relacionados:[],permisos}}).documento;
 assert.deepEqual(d.permisos,permisos);
 assert.equal(m.detalleSchema.safeParse({documento:{...d,permisos:undefined}}).success,false);
});
test('Cinco perfiles: Administrador sin documentos y navegación sin circuitos retirados',()=>{
 for(const rol of m.perfiles){const enlaces=m.enlacesPerfil(rol,null);assert.ok(enlaces.every(e=>!/(siseve|movimientos|recepcion|entrega)/i.test(e.ruta)));}
 assert.ok(!m.enlacesPerfil('Administrador',null).some(e=>e.ruta==='/documentos'));
 assert.ok(m.enlacesPerfil('Superadministrador',null).some(e=>e.ruta==='/documentos'));
 assert.ok(m.enlacesPerfil('Usuario','2').some(e=>e.ruta==='/ubicaciones'));
 assert.ok(!m.enlacesPerfil('Usuario',null).some(e=>e.ruta==='/ubicaciones'));
 assert.ok(m.enlacesPerfil('Usuario',null).some(e=>e.ruta==='/tipos-documentales'));
});
test('Ubicaciones libres: ruta completa, unidad independiente y exclusión de padres cíclicos',()=>{
 const unidades=[{id:'1',padre_id:null,clase:'Caja',nombre:'Independiente'},{id:'2',padre_id:null,clase:'Estante',nombre:'A'},{id:'3',padre_id:'2',clase:'Escalafón',nombre:'2'},{id:'4',padre_id:'3',clase:'Otro contenedor',nombre:'B'}];
 assert.equal(m.rutaUnidades(unidades,'1'),'Caja: Independiente');assert.equal(m.rutaUnidades(unidades,'4'),'Estante: A / 2 / B');assert.deepEqual(m.padresElegibles(unidades,'2').map(u=>u.id),['1']);
});
test('Delegación exige persona; modo manual no envía oficina ni usuario y no transfiere propiedad',()=>{
 assert.throws(()=>m.datosDestino({...m.destinoVacio,oficina:'1'}),/persona/);
 const datos=m.datosDestino({...m.destinoVacio,modo:'manual',nombre:' Persona manual ',oficina:'1',usuario:'90'});
 assert.deepEqual(datos,{oficina_id:null,usuario_id:null,nombre:'Persona manual',observaciones:null});
 assert.equal('responsable_actual_id'in datos,false);assert.equal('ambito_id'in datos,false);
 const html=renderToStaticMarkup(createElement(m.DestinoDocumental,{valor:{...m.destinoVacio,oficina:'1'},cambiar:()=>{},opciones}));
 assert.ok(html.includes('role="combobox"'));assert.ok(html.includes('Oficina elegible'));assert.ok(!html.includes('value="91"'));
 const manual=renderToStaticMarkup(createElement(m.DestinoDocumental,{valor:{...m.destinoVacio,modo:'manual'},cambiar:()=>{},opciones}));assert.ok(!manual.includes('Oficina opcional'));assert.ok(manual.includes('Nombre de la persona'));
});
test('API vigente: filtros, revisión, motivo, delegación y configuración usan endpoints nuevos',async()=>{
 const original=globalThis.fetch,peticiones=[];
 globalThis.fetch=async(ruta,opciones)=>{peticiones.push({ruta,opciones});if(ruta.includes('/documentos?'))return Response.json({documentos:[doc],total:1,pagina:1,limite:20});if(ruta.endsWith('/anular'))return Response.json({anulado:true});if(ruta.includes('/ubicaciones')&&opciones.method==='PUT')return Response.json({actualizado:true});return Response.json({documento:{...doc,delegacion:null,ubicacion:null,relacionados:[],permisos:{relacionar:true,corregir:true,anular:true,delegar:true,ubicar:false,pdf:true}}});};
 try{
  await m.api.lista('token','clasificacion=RECIBIDO');assert.equal(peticiones.at(-1).ruta,'/api/documentos?clasificacion=RECIBIDO');
  await m.api.corregir('token',doc.id,{revision:'2',motivo:'Corrección justificada',asunto:'Texto'});assert.equal(peticiones.at(-1).opciones.method,'PUT');assert.equal(JSON.parse(peticiones.at(-1).opciones.body).revision,'2');
  await m.api.delegar('token',doc.id,{revision:'2',nombre:'Persona indicada',usuario_id:null,oficina_id:null});assert.ok(peticiones.at(-1).ruta.endsWith('/delegar'));
  await m.api.anular('token',doc.id,{revision:'2',motivo:'Motivo'});assert.ok(peticiones.at(-1).ruta.endsWith('/anular'));
  await m.config.guardar('token','ubicaciones/4',{clase:'Caja',nombre:'A',padre_id:null},'PUT');assert.equal(peticiones.at(-1).ruta,'/api/ubicaciones/4');
  for(const p of peticiones){assert.equal(p.opciones.headers.get('Authorization'),'Bearer token');assert.ok(!/(siseve|movimientos|confirmar-entrega)/.test(p.ruta));}
 }finally{globalThis.fetch=original;}
});

test('Botones PDF: resumen simple y herramientas del visor según capacidad real',()=>{
 const callbacks={seleccionar:()=>{},abrir:()=>{}},sin={archivo:null,modificar:false,limpieza_pendiente:0};
 const html=estado=>renderToStaticMarkup(createElement(m.ResumenPdf,{estado,ocupado:false,...callbacks}));
 assert.ok(html(sin).includes('Sin PDF adjunto'));assert.ok(!html(sin).includes('<button'));
 assert.ok(html({...sin,modificar:true}).includes('Subir archivo PDF'));
 const existente=html({...sin,modificar:true,archivo:{revision:'una-revision',nombre:'vigente.pdf',tamano:400,cargado_en:'2026-11-01'}});
 assert.ok(existente.includes('vigente.pdf'));assert.ok(existente.includes('Visualizar archivo PDF'));
 assert.equal((existente.match(/<button/g)??[]).length,1);assert.ok(!/Descargar PDF|Reemplazar PDF|Eliminar PDF/.test(existente));
 const toolbar=modificar=>renderToStaticMarkup(createElement(m.HerramientasPdf,{modificar,ocupado:false,volver:()=>{},descargar:()=>{},seleccionar:()=>{},eliminar:()=>{}}));
 assert.ok(toolbar(false).includes('Descargar PDF'));assert.ok(!/Reemplazar PDF|Eliminar PDF/.test(toolbar(false)));
 assert.ok(toolbar(true).includes('Actualizar/Reemplazar PDF'));assert.ok(toolbar(true).includes('Eliminar PDF'));
});

test('Historial legible conserva etiquetas históricas y no muestra claves privadas',()=>{
 const cambios=m.cambioLegible(null,{persona:'Persona indicada',clave_r2:'privada/no-mostrar',revision:'uuid-interno'});
 assert.deepEqual(cambios,[{campo:'Persona indicada',antes:'—',despues:'Persona indicada'}]);
});

 test('Edición de tipos: nombre y motivo accesibles; prefijo usado bloqueado y cancelar disponible',()=>{
 const html=renderToStaticMarkup(createElement(m.TipoDocumentalForm,{inicial:{id:'8',nombre:'Informe',prefijo:'INF',activo:true,en_uso:true},ocupado:false,guardar:()=>{},cancelar:()=>{}}));
 assert.ok(html.includes('Guardar cambios'));assert.ok(html.includes('Cancelar'));assert.ok(html.includes('Motivo'));assert.match(html,/disabled=""[^>]*value="INF"/);assert.ok(html.includes('Los documentos anteriores conservan'));
 });

test('APIs de origen y relevo validan respuestas y conservan autenticación y versiones',async()=>{const original=globalThis.fetch,peticiones=[];globalThis.fetch=async(ruta,opciones)=>{peticiones.push({ruta,opciones});return ruta.includes('/origenes?')?Response.json({documentos:[{id:'7',codigo_visible:'INF2026007',asunto:'Origen sintético'}],hay_mas:false}):ruta.endsWith('/relevo')&&opciones.method!=='POST'?Response.json({responsable:{id:'3',nombre:'Saliente',version_autenticacion:2},candidatos:[{id:'7',nombre:'Reemplazo',version_autenticacion:4}]}):Response.json({actualizado:true});};try{const control=new globalThis.AbortController();assert.equal((await m.api.origenes('token','INF & asunto',control.signal)).documentos[0].id,'7');assert.ok(peticiones.at(-1).ruta.includes('q=INF+%26+asunto'));assert.equal(peticiones.at(-1).opciones.signal,control.signal);assert.equal((await m.config.relevo('token','9')).responsable.id,'3');const body={saliente_id:'3',reemplazo_id:'7',version_saliente:2,version_reemplazo:4,motivo:'Relevo autorizado'};await m.config.guardar('token','oficinas/9/relevo',body);assert.deepEqual(JSON.parse(peticiones.at(-1).opciones.body),body);for(const p of peticiones)assert.equal(p.opciones.headers.get('Authorization'),'Bearer token');}finally{globalThis.fetch=original;}});
