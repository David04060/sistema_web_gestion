import fs from 'node:fs';import {parse} from 'dotenv';import assert from 'node:assert/strict';import jwt from 'jsonwebtoken';import {randomUUID} from 'node:crypto';
import {abrirProduccionLectura} from './production-config.mjs';
/** Comprobación remota de solo lectura. No sustituye el login manual ni crea fixtures. */
const s=await abrirProduccionLectura();try{
 const c=s.cliente,cfg=s.configuracion;
 const httpCfg=parse(fs.readFileSync(process.env.PRODUCTION_HTTP_CONFIG_FILE??'../.private/production/render.env'));
 assert.equal(httpCfg.NEON_BRANCH_ID,cfg.NEON_BRANCH_ID);assert.equal(httpCfg.NEON_HOST,cfg.NEON_HOST);
 const base='https://sistema-documental-hw7t.onrender.com';let solicitudes=0;const cuentas=[];
 const usuarios=(await c.query("SELECT u.id::text,u.nombre_usuario,u.version_autenticacion,r.nombre rol FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.activo ORDER BY u.id")).rows;
 const docs=(await c.query("SELECT d.id::text,d.codigo,d.registrado_por_id::text,td.requiere_clave,lower(btrim(td.nombre))='síseve' siseve FROM documentos d JOIN tipos_documentales td ON td.id=d.tipo_documental_id ORDER BY d.id")).rows;
 for(const u of usuarios){const token=jwt.sign({version:u.version_autenticacion},httpCfg.JWT_SECRET,{algorithm:'HS256',subject:u.id,issuer:'sistema-web-documental',audience:'sistema-web-documental-api',expiresIn:300,jwtid:randomUUID()});
  async function get(path,status=200){solicitudes++;const r=await fetch(base+path,{headers:{Authorization:'Bearer '+token,Origin:'https://sistema-documental-p.pages.dev'},signal:globalThis.AbortSignal.timeout(55000)});assert.equal(r.status,status,u.nombre_usuario+' '+path);return r.json();}
  const me=await get('/api/auth/me');assert.ok(me.usuario);
  const autores=usuarios.filter(a=>a.id===u.id||(u.rol==='Director(a)'&&a.rol==='Secretaria de Dirección')||(u.rol==='Secretaria de Dirección'&&a.rol==='Director(a)')).map(a=>a.id);
  const permitidos=docs.filter(d=>u.rol!=='Administrador'&&!d.requiere_clave&&!d.siseve&&autores.includes(d.registrado_por_id));
  const listado=await get('/api/documentos?limite=100');assert.equal(listado.total,permitidos.length);assert.deepEqual(listado.documentos.map(d=>d.id).sort(),permitidos.map(d=>d.id).sort());
  const panel=await get('/api/dashboard');if(u.rol==='Administrador')assert.deepEqual(panel.recientes,[]);else assert.equal(panel.indicadores.find(i=>i.clave==='documentos').total,permitidos.length);
  const opciones=await get('/api/documentos/opciones');assert.ok(opciones.oficinas);assert.equal(opciones.puede_delegar_personal,u.rol==='Usuario');assert.equal(opciones.puede_decidir_registro,['Director(a)','Secretaria de Dirección'].includes(u.rol));
  for(const filtro of opciones.filtros.filter(f=>f.archivador_id)){const l=await get('/api/documentos?archivador_id='+filtro.archivador_id+'&limite=100');assert.ok(l.documentos.every(d=>permitidos.some(p=>p.id===d.id)));}
  for(const d of docs){const permitido=permitidos.some(p=>p.id===d.id);const detalle=await get('/api/documentos/'+d.id,permitido?200:404);if(permitido){assert.equal(detalle.documento.codigo,d.codigo);if(d.registrado_por_id!==u.id){assert.equal(detalle.documento.permisos.editar,false);assert.equal(detalle.documento.permisos.anular,false);}}
   await get('/api/documentos/'+d.id+'/historial',permitido?200:404);
  }
  await get('/api/movimientos?limite=100');cuentas.push({cuenta:u.nombre_usuario,rol:u.rol,documentos:permitidos.length});
 }
 const r=await fetch(base+'/api/health');assert.equal(r.status,200);const front=await fetch('https://sistema-documental-p.pages.dev');assert.equal(front.status,200);
 const resultado={fecha:new Date().toISOString(),solicitudes,cuentas,soloLectura:true,backend:base,frontend:'https://sistema-documental-p.pages.dev',rama:s.identidad.rama};fs.mkdirSync('.private/publicacion-20261028',{recursive:true});fs.writeFileSync('.private/publicacion-20261028/verificacion-api.json',JSON.stringify(resultado,null,2));console.log(resultado);
}finally{await s.cerrar();}
