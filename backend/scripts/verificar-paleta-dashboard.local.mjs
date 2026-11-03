/* global document, sessionStorage, innerWidth, getComputedStyle, window */
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {pool} from '../dist/config/database.js';
import {generarToken} from '../dist/shared/security/jwt.js';
import {chromium} from 'file:///C:/Users/David/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const fase=process.env.FASE??'despues',base='http://localhost:5173',destino='../docs/qa-paleta-oscura-20261102';
await mkdir(destino,{recursive:true});
const huellas=async()=>{const resultado={};for(const tabla of ['usuarios','documentos','documentos_pdf','auditoria_documental','auditoria_configuracion','pdf_cargas'])resultado[tabla]=(await pool.query(`SELECT count(*)::int total,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) huella FROM ${tabla} t`)).rows[0];return resultado;};
const antes=await huellas(),actores=(await pool.query('SELECT DISTINCT ON(rol_id) id::text,rol_id,version_autenticacion FROM usuarios WHERE activo ORDER BY rol_id,id')).rows;
assert.equal(actores.length,5);const browser=await chromium.launch({headless:true,channel:'chrome'}),resultado={fase,datos:[],vistas:[],errores:[]};
try{
 for(const actor of actores){
  const token=generarToken(actor.id,actor.version_autenticacion),c=await browser.newContext({reducedMotion:'reduce'});
  await c.addInitScript(t=>sessionStorage.setItem('documental.jwt',t),token);const page=await c.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>resultado.errores.push(e.message));
  await page.route('**/api/**',async r=>{assert.equal(r.request().method(),'GET');await r.continue();});
  let datos;
  for(const tema of ['claro','oscuro'])for(const width of [1440,375]){
   await page.setViewportSize({width,height:1000});const response=page.waitForResponse(r=>r.url().endsWith('/api/dashboard'));
   await page.goto(base+'/dashboard');datos=await (await response).json();await page.getByRole('heading',{name:'Accesos rápidos',exact:true}).waitFor();await page.getByRole('button',{name:tema==='claro'?'Claro':'Oscuro',exact:true}).click();
   await page.locator('.recharts-surface').first().waitFor();await page.evaluate(()=>document.fonts.ready);
   if(actor.rol_id===3){await page.locator('summary').filter({hasText:'Ámbitos personales ·'}).click();await page.locator('.recharts-surface').last().waitFor();}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.getByRole('alert').count(),0);
   for(const g of datos.estadisticas.grupos_documentales??[]){
    const region=page.getByRole('region',{name:g.clave==='global'?'Panorama institucional':g.clave==='compartido'?'Gestión de Dirección y Secretaría':g.etiqueta,exact:true});
    for(const t of g.tipos){const row=region.locator('table').first().getByRole('row',{includeHidden:true}).filter({has:page.getByRole('rowheader',{name:t.etiqueta,exact:true,includeHidden:true})});assert.equal(await row.locator('td').first().textContent(),String(t.total));}
    for(const m of g.meses){const row=region.locator(`time[datetime="${m.mes}"]`).locator('xpath=../..');assert.equal(await row.locator('td').last().textContent(),String(m.total));}
   }
   if(actor.rol_id===2){assert.equal('grupos_documentales' in datos.estadisticas,false);assert.ok(!JSON.stringify(datos).includes('Superadministrador'));}
   const graficos=await page.locator('.recharts-wrapper').evaluateAll(es=>es.map(e=>({nombre:e.querySelector('svg[role="application"]')?.getAttribute('aria-label'),categorias:[...e.querySelectorAll('g[aria-label]:has(>rect)')].map(g=>({nombre:g.getAttribute('aria-label'),color:g.querySelector('rect')?.getAttribute('fill')})),series:[...e.querySelectorAll('g.recharts-bar')].map(g=>[...g.querySelectorAll('.recharts-bar-rectangle path')].map(p=>p.getAttribute('fill'))),cantidades:[...e.querySelectorAll('.recharts-label-list text')].map(t=>t.textContent),barras:[...e.querySelectorAll('.recharts-bar-rectangle path')].map(p=>({color:p.getAttribute('fill'),valor:p.getAttribute('height')})),texto:e.textContent,rect:{width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}})));
   const tokens=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement),r={};for(const k of ['--fondo','--superficie','--superficie-secundaria','--superficie-hover','--borde','--borde-control','--texto','--texto-secundario','--primario','--grafico-azul','--grafico-oro','--grafico-terracota','--grafico-verde','--grafico-neutro'])r[k]=s.getPropertyValue(k).trim();return r;});
   await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});if(!process.env.SIN_CAPTURAS)await page.screenshot({path:`${destino}/${fase}-rol-${actor.rol_id}-${tema}-${width}.png`,fullPage:true});
   if(!process.env.SIN_CAPTURAS&&actor.rol_id===3&&tema==='oscuro'&&width===1440)await page.screenshot({path:`${destino}/${fase}-oscuro.png`});
   resultado.vistas.push({rol:actor.rol_id,tema,width,tokens,graficos});
  }
  resultado.datos.push({rol:actor.rol_id,...datos});await c.close();console.log(fase+': rol '+actor.rol_id+' comprobado');
 }
 assert.deepEqual(await huellas(),antes);resultado.datosConservados=true;assert.deepEqual(resultado.errores,[]);
 if(fase==='despues'){
  const previo=JSON.parse(await readFile(destino+'/antes.json','utf8'));
  const quitarReloj=x=>JSON.parse(JSON.stringify(x),(k,v)=>['actualizado','hasta'].includes(k)?undefined:v);
  assert.deepEqual(quitarReloj(resultado.datos),quitarReloj(previo.datos));resultado.agregadosIguales=true;
  for(const vista of resultado.vistas){const anterior=previo.vistas.find(v=>v.rol===vista.rol&&v.tema===vista.tema&&v.width===vista.width);assert.deepEqual(vista.graficos.map(g=>g.rect),anterior.graficos.map(g=>g.rect));if(vista.tema==='claro')for(const k of ['--fondo','--superficie','--superficie-secundaria','--superficie-hover','--borde','--borde-control','--texto','--texto-secundario','--primario'])assert.equal(vista.tokens[k],anterior.tokens[k]);}
  resultado.geometriaYClaroConservados=true;
  const coloresPorNombre=new Map();
  for(const vista of resultado.vistas)for(const g of vista.graficos){
   if(['Tipos documentales','Cuentas por rol'].includes(g.nombre))assert.equal(g.categorias.length,g.barras.length,'Leyenda de todas las categorías');
   if(g.categorias.length){assert.equal(new Set(g.barras.map(b=>b.color)).size,g.categorias.length);assert.equal(g.cantidades.length,g.categorias.length);for(const [i,categoria] of g.categorias.entries()){assert.equal(categoria.color,g.barras[i].color);if(coloresPorNombre.has(categoria.nombre))assert.equal(categoria.color,coloresPorNombre.get(categoria.nombre));coloresPorNombre.set(categoria.nombre,categoria.color);}}
   if(g.nombre==='Registros por mes')for(const serie of g.series)assert.equal(new Set(serie).size,1,'Cada serie mensual conserva un solo color');
  }
  resultado.coloresConsistentes=Object.fromEntries(coloresPorNombre);
 }
 await writeFile(destino+'/'+fase+'.json',JSON.stringify(resultado,null,2));console.log(JSON.stringify({fase,vistas:resultado.vistas.length,datosConservados:resultado.datosConservados,agregadosIguales:resultado.agregadosIguales,errores:resultado.errores}));
}finally{await browser.close();await pool.end();}
