import './helpers/exigir-aislamiento.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {URL} from 'node:url';
import {app} from '../dist/app.js';
import {pool} from '../dist/config/database.js';
import {authRouter} from '../dist/modules/auth/auth.routes.js';
import {administracionRouter} from '../dist/modules/usuarios/administracion.routes.js';
import {pdfRouter} from '../dist/modules/documentos-pdf/pdf.routes.js';
import {documentosRouter} from '../dist/modules/documentos/documentos.routes.js';

test('Las rutas vigentes coinciden con el inventario HTTP y Excel precede al ID',async()=>{
 try{
  const actual=[];
  for(const l of app.router.stack)if(l.route)for(const method of Object.keys(l.route.methods))actual.push(method.toUpperCase()+' '+l.route.path);
  for(const [mount,router]of [['/api/auth',authRouter],['/api',administracionRouter],['/api/documentos',pdfRouter],['/api/documentos',documentosRouter]]){
   assert.ok(app.router.stack.some(l=>l.handle===router));
   for(const l of router.stack)if(l.route)for(const method of Object.keys(l.route.methods))actual.push(method.toUpperCase()+' '+(mount+l.route.path).replace(/\/$/,''));
  }
  const expected=JSON.parse(readFileSync(new URL('./fixtures/rutas-vigentes.json',import.meta.url),'utf8'));
  assert.deepEqual(actual.sort(),expected);
  const paths=documentosRouter.stack.filter(l=>l.route).map(l=>l.route.path);
  assert.ok(paths.indexOf('/exportar-excel')>=0);assert.ok(paths.indexOf('/:id')>paths.indexOf('/exportar-excel'));
 }finally{await pool.end();}
});
