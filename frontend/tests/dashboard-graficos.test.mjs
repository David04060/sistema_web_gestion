import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'vite';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createElement} from 'react';
import {MemoryRouter} from 'react-router-dom';
import {renderToStaticMarkup} from 'react-dom/server';
const entry=resolve('src/features/dashboard/components/GraficosDashboard.tsx');
const contract=resolve('src/api/documental.ts');
const result=await build({configFile:false,logLevel:'silent',plugins:[{name:'dashboard-prueba',resolveId(i){if(i==='virtual:dashboard')return '\0virtual:dashboard';},load(i){if(i==='\0virtual:dashboard')return `export * from '${entry.replaceAll('\\','/')}';export {dashboardSchema} from '${contract.replaceAll('\\','/')}';`;}}],build:{ssr:true,write:false,minify:false,rollupOptions:{input:'virtual:dashboard',preserveEntrySignatures:'strict',output:{format:'es',codeSplitting:false}}}});
const chunk=result.output.find(c=>c.type==='chunk'&&c.isEntry);
mkdirSync('.private/render-dashboard',{recursive:true});
const file=resolve('.private/render-dashboard/entrada.mjs');writeFileSync(file,chunk.code);
const {GraficosDashboard,dashboardSchema,colorCategoria}=await import(pathToFileURL(file).href);
const contexto={actualizado:'2026-11-02T12:00:00Z',zona_horaria:'America/Lima',periodo:{desde:'2025-12-01T05:00:00Z',hasta:'2026-11-02T12:00:00Z',mes_actual_parcial:true}};
const grupo={clave:'personal',etiqueta:'Tu ámbito personal',total:3,vigentes:3,anulados:0,situaciones:[{etiqueta:'PERSONAL',total:3}],tipos:[{etiqueta:'Informe',total:2},{etiqueta:'Oficio',total:1}],meses:[{mes:'2026-10',total:1,vigentes:1,anulados:0},{mes:'2026-11',total:2,vigentes:2,anulados:0}]};
const administracion={cuentas_por_rol:[{etiqueta:'Usuario',total:4}],actividad_cuentas:[{etiqueta:'Activas',total:3},{etiqueta:'Inactivas',total:1}],actividad_oficinas:[{etiqueta:'Activas',total:2},{etiqueta:'Inactivas',total:0}]};
const render=(estadisticas,rol='Usuario')=>renderToStaticMarkup(createElement(MemoryRouter,null,createElement(GraficosDashboard,{estadisticas,rol})));

test('Las categorías mantienen su color al cambiar el orden o el subconjunto autorizado',()=>{
 assert.equal(typeof colorCategoria,'function');
 const nombres=['Informe','Oficio','Solicitud'];
 const originales=nombres.map(n=>colorCategoria(n,'tipo'));
 assert.equal(new Set(originales).size,3);
 assert.deepEqual([...nombres].reverse().map(n=>colorCategoria(n,'tipo')),originales.toReversed());
 assert.equal(colorCategoria('Oficio','tipo'),originales[1]);
 assert.equal(new Set(['Usuario','Secretaria de Dirección','Director(a)','Administrador','Superadministrador'].map(n=>colorCategoria(n,'rol'))).size,5);
});

test('Un único tipo se identifica sin inventar categorías para completar la paleta',()=>{
 const html=render({...contexto,grupos_documentales:[{...grupo,tipos:[{etiqueta:'Informe',total:3}]}]});
 assert.ok(html.includes('Un tipo documental'));
 assert.ok(!html.includes('Oficio'));assert.ok(!html.includes('Solicitud'));
 assert.ok(html.includes('100 %'));
});
test('Contrato conserva agregaciones y rechaza estadísticas documentales en respuesta administrativa',()=>{
 const input={alcance:'administrativo',usuarios:4,oficinas:2,estadisticas:{...contexto,administracion}};
 assert.deepEqual(dashboardSchema.parse(input).estadisticas,input.estadisticas);
 assert.equal(dashboardSchema.safeParse({...input,estadisticas:{...input.estadisticas,grupos_documentales:[grupo]}}).success,false);
 assert.equal(dashboardSchema.safeParse({...input,estadisticas:{...input.estadisticas,administracion:{...administracion,actividad_cuentas:[{etiqueta:'Activas',total:-1}]}}}).success,false);
});
test('El Inicio global admite las situaciones que enlazan con el filtro visible',()=>{
 const documentos=[{situacion:'DE_OTRA_CUENTA',total:3},{situacion:'CON_DELEGACION',total:2},{situacion:'ANULADO',total:1}];
 assert.deepEqual(dashboardSchema.parse({alcance:'global',usuarios:4,oficinas:2,documentos}).documentos,documentos);
});
test('Gráficos reales renderizan cantidades, denominadores, periodo y tablas accesibles',()=>{
 const html=render({...contexto,grupos_documentales:[grupo]});
 assert.ok(!html.includes('America/Lima'));assert.ok(html.includes('Tu ámbito personal'));assert.ok(html.includes('Informe'));
 assert.ok(html.includes('2026-10'));assert.ok(html.includes('<table'));assert.ok(html.includes('66.7'));
 assert.ok(html.includes('Situación de los documentos'));assert.ok(html.includes('/documentos?situacion=PERSONAL'));assert.ok(!html.includes('NaN'));assert.ok(!html.includes('Infinity'));
});

test('Un mes con actividad ofrece columnas y conserva los meses sin registros en tabla',()=>{
 const html=render({...contexto,grupos_documentales:[{...grupo,meses:[{mes:'2026-09',total:0,vigentes:0,anulados:0},{mes:'2026-10',total:3,vigentes:3,anulados:0},{mes:'2026-11',total:0,vigentes:0,anulados:0}]}]});
 assert.ok(html.includes('Actividad concentrada en un mes'));
 assert.ok(html.includes('2026-09'));assert.ok(html.includes('2026-11'));
 assert.ok(html.includes('2 meses sin registros'));
});

test('Serie sin actividad explica el periodo y no dibuja una línea de ceros',()=>{
 const html=render({...contexto,grupos_documentales:[{...grupo,meses:[{mes:'2026-10',total:0,vigentes:0,anulados:0}]}]});
 assert.ok(html.includes('Sin registros en estos meses'));
 assert.ok(html.includes('2026-10'));assert.ok(!html.includes('recharts-line'));
});

test('Distribuciones de grupos compartidos no prometen un listado filtrado de otro ámbito',()=>{
 const html=render({...contexto,grupos_documentales:[{...grupo,clave:'compartido'}]},'Secretaria de Dirección');
 assert.ok(!html.includes('/documentos?situacion='));
 assert.ok(html.includes('66.7'));assert.ok(html.includes('Situación de los documentos'));
});
test('Vacío no dibuja series ficticias y Administrador solo muestra estadísticas administrativas',()=>{
 const vacio=render({...contexto,grupos_documentales:[{...grupo,total:0,vigentes:0,situaciones:[],tipos:[],meses:[]}]});
 assert.ok(vacio.includes('Sin documentos'));assert.ok(!vacio.includes('<polyline'));
 const admin=render({...contexto,administracion},'Administrador');
 assert.ok(admin.includes('Cuentas por rol'));assert.ok(!admin.includes('Tipos documentales'));assert.ok(!admin.includes('Registros por mes'));
});
