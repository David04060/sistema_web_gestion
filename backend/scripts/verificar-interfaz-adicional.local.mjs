/* global document, sessionStorage, innerWidth, Buffer, window */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pool} from '../dist/config/database.js';
import {generarToken} from '../dist/shared/security/jwt.js';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {chromium} from 'file:///C:/Users/David/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://localhost:5173',destino='../docs/qa-dashboard-20261102';
const browser=await chromium.launch({headless:true,channel:'chrome'}),resultados={pantallas:[],contraste:[],pdf:[],errores:[]};
const actores=(await pool.query('SELECT DISTINCT ON(rol_id) id::text,rol_id,version_autenticacion FROM usuarios WHERE activo ORDER BY rol_id,id')).rows;
let ultima;
async function revisar(page,ruta,nombre,rol){
 for(const tema of ['claro','oscuro'])for(const width of [1440,768,375]){
  await page.setViewportSize({width,height:1000});await page.goto(base+ruta);await page.locator('main h1').waitFor();await page.getByRole('button',{name:tema==='claro'?'Claro':'Oscuro',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${ruta}/${tema}/${width}`);
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});
  await page.screenshot({path:`${destino}/${nombre}-rol-${rol}-${tema}-${width}.png`,fullPage:true});resultados.pantallas.push({ruta,rol,tema,width});
 }
}
try{
 const anonimo=await browser.newContext({reducedMotion:'reduce'}),login=await anonimo.newPage();ultima=login;await revisar(login,'/login','login',0);await anonimo.close();
 for(const a of actores){
  const c=await browser.newContext({reducedMotion:'reduce'});await c.addInitScript(t=>sessionStorage.setItem('documental.jwt',t),generarToken(a.id,a.version_autenticacion));const page=await c.newPage();ultima=page;page.setDefaultTimeout(10000);page.on('pageerror',e=>resultados.errores.push(e.message));
  await page.route('**/api/**',async r=>{assert.equal(r.request().method(),'GET');await r.continue();});
  if(a.rol_id<=2){await revisar(page,'/usuarios/'+a.id,'cuenta-detalle',a.rol_id);const oficina=(await pool.query('SELECT id::text FROM oficinas ORDER BY id LIMIT 1')).rows[0];await revisar(page,'/oficinas/'+oficina.id,'oficina-detalle',a.rol_id);}
  if(a.rol_id!==2){await page.goto(base+'/documentos');await page.locator('main h1').waitFor();await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));const enlace=page.locator('td[data-label="Código"] a').first();const href=await enlace.getAttribute('href');await revisar(page,href,'documento-detalle',a.rol_id);
   await page.getByRole('button',{name:'Ver más detalles de auditoría'}).click();await page.getByRole('heading',{name:'Auditoría detallada'}).waitFor();await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));await page.screenshot({path:`${destino}/historial-auditoria-rol-${a.rol_id}.png`,fullPage:true});
  }
  if(a.rol_id>=3){
   const pdf=await PDFDocument.create(),f=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage().drawText('Prueba local de interfaz PDF',{x:40,y:700,font:f,size:16});const bytes=Buffer.from(await pdf.save());
   await page.goto(base+'/documentos/nuevo');await page.getByRole('textbox',{name:/^Asunto/}).fill('Conservar sin enviar');await page.getByLabel('PDF opcional (máximo 15 MiB)').setInputFiles({name:'prueba-local.pdf',mimeType:'application/pdf',buffer:bytes});await page.getByText('Página 1 de 1',{exact:true}).waitFor();
   await page.route('**/api/documentos/*/pdf',r=>r.fulfill({json:{archivo:{revision:'123e4567-e89b-42d3-a456-426614174000',nombre:'prueba-local.pdf',tamano_bytes:bytes.length,actualizado_en:'2026-11-02T12:00:00Z'},modificar:true,limpieza_pendiente:0}}));
   // Detalle y metadatos reales; contenido del visor controlado localmente para evitar R2 y escrituras.
   await page.route('**/api/documentos/*/pdf/abrir',r=>r.fulfill({json:{url:base+'/qa-pdf-local',vence_en:300}}));await page.route('**/qa-pdf-local',r=>r.fulfill({body:bytes,contentType:'application/pdf'}));
   await page.goto(base+'/documentos');await page.locator('td[data-label="Código"] a').first().click();await page.getByRole('button',{name:'Visualizar archivo PDF'}).click();await page.getByText('Página 1 de 1',{exact:true}).waitFor();
   for(const tema of ['claro','oscuro'])for(const width of [1440,768,375]){await page.setViewportSize({width,height:1000});await page.getByRole('button',{name:tema==='claro'?'Claro':'Oscuro',exact:true}).click();await page.waitForFunction(()=>document.querySelector('canvas')?.width>0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.locator('section').filter({has:page.getByRole('heading',{name:'Archivo PDF',exact:true})}).screenshot({path:`${destino}/visor-controles-${a.rol_id}-${tema}-${width}.png`});resultados.pdf.push({rol:a.rol_id,tema,width,contenido:'fixture-local',controles:true});}
  }
  await writeFile(destino+'/resultados-adicionales.json',JSON.stringify(resultados,null,2));await c.close();console.log('Detalles verificados: rol '+a.rol_id);
 }
 assert.deepEqual(resultados.errores,[]);await writeFile(destino+'/resultados-adicionales.json',JSON.stringify(resultados,null,2));console.log(JSON.stringify({pantallas:resultados.pantallas.length,pdf:resultados.pdf.length,errores:resultados.errores}));
}catch(e){await ultima?.screenshot({path:destino+'/fallo-adicional.png',fullPage:true});throw e;}finally{await browser.close();await pool.end();}
