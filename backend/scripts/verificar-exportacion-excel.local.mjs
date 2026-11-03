/* global document, sessionStorage, innerWidth, setTimeout */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import ExcelJS from 'exceljs';
import {app} from '../dist/app.js';
import {pool} from '../dist/config/database.js';
import {generarToken} from '../dist/shared/security/jwt.js';
import {chromium} from 'file:///C:/Users/David/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {createServer} from '../../frontend/node_modules/vite/dist/node/index.js';
const destino='../docs/qa-exportacion-excel-20261102',descargas='../.private/exportacion-excel';await mkdir(destino,{recursive:true});await mkdir(descargas,{recursive:true});
const h=async()=>{const r={};for(const t of ['usuarios','documentos','documentos_pdf','valores_documento','delegaciones_documento','ubicaciones_documento','auditoria_documental','auditoria_configuracion','pdf_cargas'])r[t]=(await pool.query(`SELECT count(*)::int total,md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY to_jsonb(x)::text),'')) huella FROM ${t} x`)).rows[0];return r;};
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const api='http://127.0.0.1:'+server.address().port;
const vite=await createServer({root:'../frontend',server:{host:'127.0.0.1',port:5181,strictPort:true,proxy:{'/api':{target:api,changeOrigin:true}}}});await vite.listen();const base='http://127.0.0.1:5181';
const browser=await chromium.launch({headless:true,channel:'chrome'}),resultado={vistas:[],descargas:[],errores:[],estados:[]};let ultima;
async function abrirDescarga(evento,ruta,esperado){const d=await evento;assert.equal(d.suggestedFilename(),esperado);await d.saveAs(ruta);assert.equal(await d.failure(),null);const libro=new ExcelJS.Workbook();await libro.xlsx.readFile(ruta);return libro.getWorksheet('Documentos');}
try{
 const antes=await h();const p=(await pool.query("SELECT to_char(max(creado_en) AT TIME ZONE 'America/Lima','YYYY') anio,to_char(max(creado_en) AT TIME ZONE 'America/Lima','MM') mes FROM documentos")).rows[0];assert.ok(p.anio);
 const actores=(await pool.query('SELECT DISTINCT ON(u.rol_id) u.id::text,u.rol_id,u.version_autenticacion,m.ambito_id::text FROM usuarios u LEFT JOIN miembros_ambito m ON m.usuario_id=u.id WHERE u.activo ORDER BY u.rol_id,u.id')).rows;
 for(const a of actores){
  const token=generarToken(a.id,a.version_autenticacion),c=await browser.newContext({acceptDownloads:true,reducedMotion:'reduce'});await c.addInitScript(t=>sessionStorage.setItem('documental.jwt',t),token);const page=await c.newPage();ultima=page;page.setDefaultTimeout(12000);let solicitudes=0,archivos=0;
  page.on('pageerror',e=>resultado.errores.push(e.message));page.on('download',()=>archivos++);page.on('request',r=>{if(r.url().includes('/exportar-excel'))solicitudes++;});
  await page.route('**/api/**',async r=>{assert.equal(r.request().method(),'GET');await r.continue();});
  if(a.rol_id===2){await page.goto(base+'/documentos');await page.getByRole('heading',{name:'Acceso no autorizado'}).waitFor();assert.equal(await page.getByRole('button',{name:'Exportar a Excel',exact:true}).count(),0);assert.equal((await fetch(api+`/api/documentos/exportar-excel?anio=${p.anio}&mes=${p.mes}`,{headers:{Authorization:'Bearer '+token}})).status,403);resultado.estados.push({rol:2,rechazo403:true});await c.close();continue;}
  const total=(await pool.query(`SELECT count(*)::int total FROM documentos WHERE to_char(creado_en AT TIME ZONE 'America/Lima','YYYY-MM')=$1 AND ($2::int=1 OR ($2::int IN (3,4) AND situacion<>'ANULADO') OR ($2::int=5 AND situacion<>'ANULADO' AND ambito_id=$3::bigint))`,[p.anio+'-'+p.mes,a.rol_id,a.ambito_id])).rows[0].total;
  const carpeta=descargas+'/rol-'+a.rol_id;await mkdir(carpeta,{recursive:true});
  for(const tema of ['claro','oscuro'])for(const width of [1440,375]){
   await page.setViewportSize({width,height:900});await page.goto(base+'/documentos?limite=1');await page.locator('td[data-label="Código"]').first().waitFor();assert.equal(await page.locator('td[data-label="Código"]').count(),1);await page.getByRole('button',{name:tema==='claro'?'Claro':'Oscuro',exact:true}).click();
   const previas=solicitudes,descargados=archivos;const boton=page.getByRole('button',{name:'Exportar a Excel',exact:true});await boton.click();const dialogo=page.getByRole('dialog',{name:'Exportar documentos a Excel'});await dialogo.waitFor();assert.equal(solicitudes,previas);assert.equal(archivos,descargados);
   await dialogo.getByLabel('Año de registro').fill(p.anio);await dialogo.getByLabel('Mes de registro').selectOption(p.mes);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const caja=await dialogo.boundingBox();assert.ok(caja.width<=width&&caja.height<=900-30);
   await page.screenshot({path:`${destino}/dialogo-rol-${a.rol_id}-${tema}-${width}.png`});await dialogo.getByRole('button',{name:'Cancelar',exact:true}).click();await dialogo.waitFor({state:'detached'});assert.equal(solicitudes,previas);assert.equal(archivos,descargados);
   await boton.click();const descarga=page.waitForEvent('download');await dialogo.getByRole('button',{name:'Exportar a Excel',exact:true}).click();
   const hoja=await abrirDescarga(descarga,`${carpeta}/${tema}-${width}.xlsx`,`documentos-${p.anio}-${p.mes}.xlsx`);assert.equal(hoja.rowCount,total+1);await dialogo.getByRole('status').filter({hasText:'Se inició la descarga'}).waitFor();assert.equal(solicitudes,previas+1);assert.equal(archivos,descargados+1);assert.ok(hoja.rowCount-1>1);
   resultado.vistas.push({rol:a.rol_id,tema,width,abrirSinDescarga:true,cancelarSinDescarga:true,filas:hoja.rowCount-1,paginaVisible:1});resultado.descargas.push({rol:a.rol_id,tema,width,filas:hoja.rowCount-1,abiertoConExcelJS:true});await dialogo.getByRole('button',{name:'Cancelar',exact:true}).click();
  }
  if(a.rol_id===5){
   const boton=page.getByRole('button',{name:'Exportar a Excel',exact:true});await boton.click();const d=page.getByRole('dialog');
   await page.route('**/api/documentos/exportar-excel?*',async r=>{await new Promise(resolve=>setTimeout(resolve,700));await r.continue().catch(()=>{});});const previas=solicitudes;
   const descarga=page.waitForEvent('download');await d.getByRole('button',{name:'Exportar a Excel',exact:true}).click();await d.getByRole('button',{name:'Exportando…'}).waitFor();assert.equal(await d.getByRole('button',{name:'Exportando…'}).isDisabled(),true);await d.locator('form').dispatchEvent('submit');await d.locator('form').dispatchEvent('submit');assert.equal(solicitudes,previas+1);await page.screenshot({path:destino+'/progreso.png'});await abrirDescarga(descarga,carpeta+'/doble-envio.xlsx',`documentos-${p.anio}-${p.mes}.xlsx`);await d.getByRole('status').filter({hasText:'Se inició'}).waitFor();await page.unroute('**/api/documentos/exportar-excel?*');
   await page.route('**/api/documentos/exportar-excel?*',r=>r.fulfill({status:500,json:{error:'SQL privado'}}));await d.getByRole('button',{name:'Exportar a Excel',exact:true}).click();await d.getByRole('alert').waitFor();assert.ok(!(await d.getByRole('alert').innerText()).includes('SQL privado'));await page.screenshot({path:destino+'/error.png'});await page.unroute('**/api/documentos/exportar-excel?*');const reintento=page.waitForEvent('download');await d.getByRole('button',{name:'Reintentar exportación'}).click();await abrirDescarga(reintento,carpeta+'/reintento.xlsx',`documentos-${p.anio}-${p.mes}.xlsx`);await d.getByRole('status').filter({hasText:'Se inició'}).waitFor();
   await d.getByLabel('Año de registro').fill('1900');await d.getByLabel('Mes de registro').selectOption('01');const vacio=page.waitForEvent('download');await d.getByRole('button',{name:'Exportar a Excel',exact:true}).click();const hoja=await abrirDescarga(vacio,carpeta+'/vacio.xlsx','documentos-1900-01.xlsx');assert.equal(hoja.rowCount,1);await d.getByRole('status').filter({hasText:'No hay documentos'}).waitFor();await page.screenshot({path:destino+'/vacio.png'});
   resultado.estados.push({rol:5,dobleEnvioBloqueado:true,progreso:true,error500:true,reintento:true,vacio:true});
  }
  await c.close();console.log('Excel navegador: rol '+a.rol_id+' aprobado');
 }
 assert.deepEqual(await h(),antes);assert.deepEqual(resultado.errores,[]);resultado.datosConservados=true;await writeFile(destino+'/resultados.json',JSON.stringify(resultado,null,2));console.log(JSON.stringify({vistas:resultado.vistas.length,descargas:resultado.descargas.length,datosConservados:true,errores:resultado.errores}));
}catch(error){await ultima?.screenshot({path:destino+'/fallo.png'});throw error;}finally{await browser.close();await vite.close();await new Promise(r=>server.close(r));await pool.end();}
