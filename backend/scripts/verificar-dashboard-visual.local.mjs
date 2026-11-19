/* global document, sessionStorage, innerWidth, getComputedStyle, window, Buffer, setTimeout, structuredClone */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {app} from '../dist/app.js';
import {pool} from '../dist/config/database.js';
import {generarToken} from '../dist/shared/security/jwt.js';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {chromium} from 'file:///C:/Users/David/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {createServer} from '../../frontend/node_modules/vite/dist/node/index.js';
const destino='../docs/qa-dashboard-20261102';
await mkdir(destino,{recursive:true});
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base='http://127.0.0.1:'+server.address().port;
const vite=await createServer({root:'../frontend',server:{host:'127.0.0.1',port:5179,strictPort:true,proxy:{'/api':{target:base,changeOrigin:true}}}});
const informe={matriz:[],pantallas:[],datos:[],estados:[],errores:[],conservacion:false};
const huellas=async()=>{const r={};for(const tabla of ['usuarios','documentos','documentos_pdf','auditoria_documental','auditoria_configuracion','pdf_cargas'])r[tabla]=(await pool.query(`SELECT count(*)::int total,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) huella FROM ${tabla} t`)).rows[0];return r;};
let browser,ultimaPagina;
try {
 const antes=await huellas();
 const actores=(await pool.query('SELECT DISTINCT ON(rol_id) id::text,rol_id,version_autenticacion FROM usuarios WHERE activo ORDER BY rol_id,id')).rows;
 assert.equal(actores.length,5);
 await vite.listen();browser=await chromium.launch({headless:true,channel:'chrome'});
 const pdf=await PDFDocument.create();const fuente=await pdf.embedFont(StandardFonts.Helvetica);for(let i=1;i<=2;i++)pdf.addPage([595,842]).drawText('Prueba local de visualizacion - pagina '+i,{x:50,y:760,size:18,font:fuente});const bytes=Buffer.from(await pdf.save());
 for(const actor of actores.filter(a=>!process.env.QA_ROL||process.env.QA_ROL.split(',').map(Number).includes(a.rol_id))){
  const token=generarToken(actor.id,actor.version_autenticacion);
  const response=await fetch(base+'/api/dashboard',{headers:{Authorization:'Bearer '+token}});assert.equal(response.status,200);const datos=await response.json();
  informe.datos.push({rol:actor.rol_id,alcance:datos.alcance,grupos:datos.estadisticas.grupos_documentales?.map(g=>({clave:g.clave,total:g.total,vigentes:g.vigentes,anulados:g.anulados,situaciones:g.situaciones,tipos:g.tipos,meses:g.meses})),administracion:datos.estadisticas.administracion});
  const contexto=await browser.newContext({reducedMotion:'reduce'});
  await contexto.addInitScript(t=>sessionStorage.setItem('documental.jwt',t),token);
  const page=await contexto.newPage();ultimaPagina=page;page.setDefaultTimeout(10000);page.on('pageerror',e=>informe.errores.push({rol:actor.rol_id,error:e.message}));
  await page.route('**/api/**',async r=>{assert.equal(r.request().method(),'GET','El recorrido no debe escribir datos');await r.continue();});
  for(const tema of ['claro','oscuro'])for(const width of [1440,768,375]){
   await page.setViewportSize({width,height:1000});
   await page.goto('http://127.0.0.1:5179/dashboard');
   await page.getByRole('heading',{name:'Accesos rápidos',exact:true}).waitFor();
   await page.getByRole('button',{name:tema==='claro'?'Claro':'Oscuro',exact:true}).click();
   await page.locator('.recharts-surface').first().waitFor();
   await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`desborde ${actor.rol_id}/${tema}/${width}`);
   assert.equal(await page.getByRole('alert').count(),0);
   assert.match(await page.locator('main').evaluate(e=>getComputedStyle(e).fontFamily),/IBM Plex Sans/);
   if(actor.rol_id===2)assert.equal(await page.getByRole('heading',{name:'Tipos documentales',exact:true}).count(),0);
   for(const g of datos.estadisticas.grupos_documentales??[]){
    const seccion=page.getByRole('region',{name:g.clave==='global'?'Panorama institucional':g.clave==='compartido'?'Gestión de Dirección y Secretaría':g.etiqueta,exact:true});
    if(g.clave==='personales_ajenos')await page.locator('summary').filter({hasText:'Ámbitos personales ·'}).click();
    await seccion.getByText(g.total.toLocaleString('es-PE')+' documentos',{exact:true}).waitFor();
    for(const t of g.tipos){const row=seccion.locator('table').first().getByRole('row',{includeHidden:true}).filter({has:page.getByRole('rowheader',{name:t.etiqueta,exact:true,includeHidden:true})});assert.equal(await row.locator('td').first().textContent(),String(t.total));}
    for(const m of g.meses){const row=seccion.locator(`time[datetime="${m.mes}"]`).locator('xpath=../..');assert.equal(await row.locator('td').last().textContent(),String(m.total));}
   }
   await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:`${destino}/rol-${actor.rol_id}-${tema}-${width}.png`,fullPage:true});if(width===1440)await page.screenshot({path:`${destino}/vista-rol-${actor.rol_id}-${tema}.png`});
   informe.matriz.push({rol:actor.rol_id,tema,width,graficos:await page.locator('.recharts-surface').count(),sinDesborde:true});
  }
  // Carga lenta inicial: no hay cifras anteriores ni ceros ficticios.
  await page.route('**/api/dashboard',async r=>{await new Promise(resolve=>setTimeout(resolve,700));await r.continue();});
  await page.goto('http://127.0.0.1:5179/dashboard');await page.getByRole('status',{name:'Cargando información…'}).waitFor();await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:`${destino}/carga-rol-${actor.rol_id}.png`});
  await page.getByRole('heading',{name:'Accesos rápidos',exact:true}).waitFor();await page.unroute('**/api/dashboard');
  await page.route('**/api/dashboard',r=>r.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'SQL privado'})}));
  await page.getByRole('button',{name:'Actualizar panel'}).click();await page.getByRole('alert').waitFor();assert.ok(!(await page.getByRole('alert').innerText()).includes('SQL privado'));
  await page.unroute('**/api/dashboard');await page.getByRole('button',{name:'Reintentar'}).click();await page.getByRole('alert').waitFor({state:'detached'});
  informe.estados.push({rol:actor.rol_id,carga:true,error500:true,reintento:true});
  const rutas=process.env.QA_RAPIDA?[]:actor.rol_id<=2?['/usuarios','/usuarios/nuevo','/oficinas','/oficinas/nuevo','/roles','/ubicaciones']:['/documentos','/documentos/nuevo','/tipos-documentales','/ubicaciones'];
  for(const ruta of rutas)for(const tema of ['claro','oscuro'])for(const width of [1440,768,375]){
   await page.setViewportSize({width,height:1000});await page.goto('http://127.0.0.1:5179'+ruta);await page.locator('main h1').waitFor();await page.getByRole('button',{name:tema==='claro'?'Claro':'Oscuro',exact:true}).click();
   await page.locator('[aria-busy="true"]').waitFor({state:'detached'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${ruta}/${tema}/${width}`);
   informe.pantallas.push({rol:actor.rol_id,ruta,tema,width});
   if(width===375)await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:`${destino}/pantalla-${actor.rol_id}-${ruta.replaceAll('/','_')}-${tema}.png`,fullPage:true});
  }
  if(actor.rol_id>=3&&(!process.env.QA_RAPIDA||process.env.QA_PDF)){
   await page.goto('http://127.0.0.1:5179/documentos/nuevo');await page.getByRole('textbox',{name:/^Asunto/}).fill('Texto de prueba sin guardar');await page.getByLabel('PDF opcional (máximo 15 MiB)').setInputFiles({name:'prueba-local.pdf',mimeType:'application/pdf',buffer:bytes});
   await page.getByText('Página 1 de 2',{exact:true}).waitFor();await page.getByRole('button',{name:'Siguiente',exact:true}).click();await page.getByText('Página 2 de 2',{exact:true}).waitFor();
   for(const tema of ['claro','oscuro'])for(const width of [1440,768,375]){
    await page.setViewportSize({width,height:1000});await page.getByRole('button',{name:tema==='claro'?'Claro':'Oscuro',exact:true}).click();await page.getByText('Página 2 de 2',{exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:/^Asunto/}).inputValue(),'Texto de prueba sin guardar');
    await page.waitForFunction(()=>{const c=document.querySelector('canvas');return c&&c.width>0;});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:`${destino}/pdf-rol-${actor.rol_id}-${tema}-${width}.png`,fullPage:true});informe.pantallas.push({rol:actor.rol_id,ruta:'previsualizacion-pdf-pagina-2',tema,width});
   }
  }
  if(actor.rol_id===5){
   const fixture=structuredClone(datos);fixture.estados=[{situacion:'PERSONAL',total:5}];fixture.recientes=[];
   const g=fixture.estadisticas.grupos_documentales[0];g.total=5;g.vigentes=5;g.anulados=0;g.situaciones=[{etiqueta:'PERSONAL',total:5}];g.tipos=[{etiqueta:'Informe',total:5}];g.meses=g.meses.map((m,i)=>({...m,total:i===9?2:i===11?3:0,vigentes:i===9?2:i===11?3:0,anulados:0}));
   await page.route('**/api/dashboard',r=>r.fulfill({json:fixture}));await page.goto('http://127.0.0.1:5179/dashboard');await page.getByRole('heading',{name:'Accesos rápidos',exact:true}).waitFor();
   await page.locator('.recharts-line').waitFor();assert.equal(await page.locator('.recharts-line-dot').count(),3,'conservar cero intermedio');
   const grafico=page.locator('.recharts-surface').last();await grafico.focus();await page.keyboard.press('ArrowRight');await page.locator('.recharts-tooltip-wrapper').filter({visible:true}).first().waitFor();
   await page.getByRole('combobox',{name:/^Periodo/}).selectOption('completo');assert.equal(await page.locator('.recharts-line-dot').count(),12);await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:destino+'/tendencia-teclado-fixture.png',fullPage:true});
   await page.unroute('**/api/dashboard');
   fixture.estados=[];g.total=0;g.vigentes=0;g.situaciones=[];g.tipos=[];g.meses=g.meses.map(m=>({...m,total:0,vigentes:0}));
   await page.route('**/api/dashboard',r=>r.fulfill({json:fixture}));await page.goto('http://127.0.0.1:5179/dashboard');await page.getByText('Sin documentos en este ámbito',{exact:true}).waitFor();assert.equal(await page.locator('.recharts-surface').count(),0);await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:destino+'/vacio-fixture.png',fullPage:true});await page.unroute('**/api/dashboard');
   informe.estados.push({rol:5,fixture:true,vacio:true,tendencia:true,ceroIntermedio:true,tecladoTooltip:true});
  }
  console.log('Recorrido terminado: rol '+actor.rol_id);
  await contexto.close();
 }
 assert.deepEqual(await huellas(),antes);informe.conservacion=true;assert.deepEqual(informe.errores,[]);
 await writeFile(destino+(process.env.QA_RAPIDA?'/resultados-finales.json':'/resultados.json'),JSON.stringify(informe,null,2));
 console.log(JSON.stringify({dashboards:informe.matriz.length,pantallas:informe.pantallas.length,estados:informe.estados.length,errores:informe.errores,conservacion:informe.conservacion}));
}catch(error){await ultimaPagina?.screenshot({path:destino+'/fallo-recorrido.png',fullPage:true});await writeFile(destino+'/recorrido-parcial.json',JSON.stringify({...informe,fallo:String(error)},null,2));throw error;}finally{await browser?.close();await vite.close();await new Promise(r=>server.close(r));await pool.end();}
