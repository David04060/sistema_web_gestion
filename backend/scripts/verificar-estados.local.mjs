/* global sessionStorage, document, setTimeout */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pool} from '../dist/config/database.js';
import {generarToken} from '../dist/shared/security/jwt.js';
import {chromium} from 'file:///C:/Users/David/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const a=(await pool.query('SELECT id::text,version_autenticacion FROM usuarios WHERE activo AND rol_id=5 ORDER BY id LIMIT 1')).rows[0];
const browser=await chromium.launch({headless:true,channel:'chrome'}),c=await browser.newContext({viewport:{width:375,height:900},reducedMotion:'reduce'});
await c.addInitScript(t=>sessionStorage.setItem('documental.jwt',t),generarToken(a.id,a.version_autenticacion));const page=await c.newPage();page.setDefaultTimeout(8000);
const base='http://localhost:5173',destino='../docs/qa-dashboard-20261102',lista=/\/api\/documentos(?:\?.*)?$/;
try{
 await page.route('**/api/**',async r=>{assert.equal(r.request().method(),'GET');await r.continue();});
 await page.goto(base+'/documentos');await page.locator('td[data-label="Código"] a').first().waitFor();const href=await page.locator('td[data-label="Código"] a').first().getAttribute('href');
 await page.route(lista,async r=>{await new Promise(resolve=>setTimeout(resolve,800));await r.continue();});await page.reload();await page.getByRole('status',{name:'Cargando información…'}).waitFor();await page.screenshot({path:destino+'/lista-carga-lenta.png',fullPage:true});await page.locator('td[data-label="Código"] a').first().waitFor();await page.unroute(lista);
 await page.getByRole('button',{name:'Oscuro',exact:true}).click();await page.route(lista,r=>r.fulfill({status:500,json:{error:'SQL privado'}}));await page.reload();await page.getByRole('alert').waitFor();assert.ok(!(await page.getByRole('alert').innerText()).includes('SQL privado'));await page.screenshot({path:destino+'/lista-error.png',fullPage:true});await page.unroute(lista);await page.getByRole('button',{name:'Reintentar',exact:true}).click();await page.locator('td[data-label="Código"] a').first().waitFor();
 await page.route(lista,r=>r.fulfill({json:{documentos:[],total:0,pagina:1,limite:25}}));await page.reload();await page.getByText('No hay documentos que coincidan.',{exact:false}).waitFor();await page.screenshot({path:destino+'/lista-vacia-fixture.png',fullPage:true});await page.unroute(lista);
 await page.route('**/api/documentos/*/pdf',r=>r.fulfill({status:500,json:{error:'SQL privado'}}));await page.goto(base+href);const pdf=page.locator('section').filter({has:page.getByRole('heading',{name:'Archivo PDF',exact:true})});await pdf.getByRole('alert').waitFor();await pdf.getByRole('button',{name:'Reintentar',exact:true}).waitFor();await page.screenshot({path:destino+'/pdf-error.png',fullPage:true});await page.unroute('**/api/documentos/*/pdf');await pdf.getByRole('button',{name:'Reintentar',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[aria-label="Consultando PDF…"]'));assert.equal(await pdf.getByRole('alert').count(),0);
 await writeFile(destino+'/estados-lista-pdf.json',JSON.stringify({listaCarga:true,listaError:true,listaVaciaFixture:true,listaReintento:true,pdfError:true,pdfReintento:true}));console.log('Estados de lista y PDF aprobados.');
}finally{await browser.close();await pool.end();}
