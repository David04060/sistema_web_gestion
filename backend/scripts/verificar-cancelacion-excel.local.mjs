/* global sessionStorage,document,setTimeout */
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
import {pool} from '../dist/config/database.js';import {generarToken} from '../dist/shared/security/jwt.js';
import {chromium} from 'file:///C:/Users/David/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const a=(await pool.query('SELECT id::text,version_autenticacion FROM usuarios WHERE activo AND rol_id=5 LIMIT 1')).rows[0];const browser=await chromium.launch({headless:true,channel:'chrome'}),c=await browser.newContext({acceptDownloads:true});
try{
 await c.addInitScript(t=>sessionStorage.setItem('documental.jwt',t),generarToken(a.id,a.version_autenticacion));const page=await c.newPage();let descargas=0;page.on('download',()=>descargas++);
 await page.goto('http://localhost:5173/documentos');const b=page.getByRole('button',{name:'Exportar a Excel',exact:true});await b.click();const d=page.getByRole('dialog');await d.getByRole('button',{name:'Cancelar',exact:true}).click();await d.waitFor({state:'detached'});
 assert.equal(await b.evaluate(e=>document.activeElement===e),true,'Devolver foco al botón que abrió el diálogo');
 await b.click();await page.route('**/api/documentos/exportar-excel?*',async r=>{const respuesta=await r.fetch();await new Promise(resolve=>setTimeout(resolve,800));await r.fulfill({response:respuesta}).catch(()=>{});});await d.getByRole('button',{name:'Exportar a Excel',exact:true}).click();await d.getByRole('button',{name:'Exportando…'}).waitFor();await d.getByRole('button',{name:'Cancelar',exact:true}).click();await d.waitFor({state:'detached'});await new Promise(resolve=>setTimeout(resolve,1200));assert.equal(descargas,0);await page.unroute('**/api/documentos/exportar-excel?*');
 await b.click();const descarga=page.waitForEvent('download');await d.getByRole('button',{name:'Exportar a Excel',exact:true}).click();const archivo=await descarga;assert.equal(await archivo.failure(),null);assert.equal(descargas,1);
 await mkdir('../docs/qa-exportacion-excel-20261102',{recursive:true});await writeFile('../docs/qa-exportacion-excel-20261102/cancelacion.json',JSON.stringify({focoRestaurado:true,cancelarEnProcesoSinDescarga:true,reapertura:true}));console.log('Foco, cancelación durante la descarga y reapertura aprobados.');
}finally{await browser.close();await pool.end();}
