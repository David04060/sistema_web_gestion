import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,URL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import pg from 'pg';
import {suites} from '../tests/helpers/suites.mjs';
import {consultaIdentidad,validarIdentidad} from '../tests/helpers/entorno-prueba.mjs';
import {crearFixtures} from '../tests/fixtures/base.mjs';
import {inventariarPruebas} from '../tests/catalogo-pruebas.mjs';

const backend=fileURLToPath(new URL('../',import.meta.url));
const modo=process.argv[2]??'completa';
if(process.argv.length>3)throw Error('El runner no acepta argumentos adicionales ni perfiles remotos');
if(modo==='--listar'){console.log(JSON.stringify(inventariarPruebas(),null,2));process.exit(0);}
if(modo==='--help'){
 console.log('Uso: node scripts/probar-backend-aislado.mjs [completa|revision|documental|mejoras|unitarias-heredadas|--listar]\nRequiere PostgreSQL 18 (initdb, postgres, pg_ctl y psql) en PATH o POSTGRES_TEST_BIN.\nCrea y retira un cluster nuevo; no lee .env de trabajo. Sin R2 ni navegador.\nPOSTGRES_TEST_ID_BASE permite repetir con otra base de IDs sintéticos.');
 process.exit(0);
}
if(!suites[modo])throw Error('Suite desconocida: completa, revision, documental, mejoras o unitarias-heredadas');
if(process.env.POSTGRES_TEST_ID_BASE!==undefined){const n=Number(process.env.POSTGRES_TEST_ID_BASE);if(!Number.isSafeInteger(n)||n<100||n>10000000)throw Error('POSTGRES_TEST_ID_BASE inválido');}
const exe=name=>path.join(process.env.POSTGRES_TEST_BIN??'',name+(process.platform==='win32'?'.exe':''));
const limpio={...process.env};
for(const key of Object.keys(limpio))if(/^(PG|R2_|NEON_|DATABASE_URL$|JWT_SECRET$|DOTENV_CONFIG_PATH$|RENDER$|POSTGRES_TEST_MANIFEST$|NODE_TEST_CONTEXT$)/.test(key))delete limpio[key];
const raiz=await fs.mkdtemp(path.join(tmpdir(),'paillardelle-test-'));
const datos=path.join(raiz,'datos'),marca=randomBytes(32).toString('hex'),rol='prueba_'+randomBytes(8).toString('hex'),clave=randomBytes(32).toString('hex');
const listener=createServer();await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});const puerto=listener.address().port;await new Promise(r=>listener.close(r));
const env={...limpio,PGHOST:'127.0.0.1',PGPORT:String(puerto),PGUSER:rol,PGPASSWORD:clave,PGDATABASE:'postgres'};
let iniciado=false;
async function ejecutar(command,args,options={}){
 return await new Promise((resolve,reject)=>{const child=spawn(command,args,{env,cwd:backend,windowsHide:true,...options});let salida='';
  child.stdout?.on('data',b=>{salida+=b;});child.stderr?.on('data',b=>{salida+=b;});child.once('error',()=>reject(Error('No se pudo ejecutar '+path.basename(command)+'. Requiere PostgreSQL 18 en PATH o POSTGRES_TEST_BIN.')));child.once('exit',code=>resolve({code,salida}));});
}
async function bin(name,args){const r=await ejecutar(exe(name),args);if(r.code!==0)throw Error(name+' no completó la preparación del entorno temporal: '+r.salida.slice(-2000).replaceAll(clave,'[omitido]'));}
async function cerrar(){
 if(iniciado)await bin('pg_ctl',['-D',datos,'-m','fast','-w','-t','20','stop']);
 const realRoot=await fs.realpath(raiz),realParent=await fs.realpath(path.dirname(raiz));
 if(path.dirname(realRoot)!==realParent||!path.basename(realRoot).startsWith('paillardelle-test-'))throw Error('No se valida el directorio temporal para retirarlo');
 await fs.rm(realRoot,{recursive:true,force:true});
 console.log('Instancia temporal detenida y retirada; no se utilizó la base de trabajo.');
}
try{
 const version=await ejecutar(exe('postgres'),['--version']);
 if(version.code!==0||!/PostgreSQL\) 18\./.test(version.salida))throw Error('El fixture de esquema requiere PostgreSQL 18');
 await fs.writeFile(path.join(raiz,'clave.txt'),clave,{mode:0o600});
 await bin('initdb',['-D',datos,'-U',rol,'--auth=scram-sha-256','--pwfile='+path.join(raiz,'clave.txt'),'--encoding=UTF8','--locale=C']);
 await bin('pg_ctl',['-D',datos,'-l',path.join(raiz,'servidor.log'),'-w','-t','20','-o',`-h 127.0.0.1 -p ${puerto} -c pruebas.ejecucion=${marca}`,'start']);iniciado=true;
 const url=`postgresql://${rol}:${clave}@127.0.0.1:${puerto}/sistema_web_documental_final`;
 const admin=new pg.Client({connectionString:url.replace('/sistema_web_documental_final','/postgres')});await admin.connect();
 let m;
 try{const i=(await admin.query(consultaIdentidad)).rows[0];m={version:1,host:'127.0.0.1',puerto,base:'sistema_web_documental_final',rol,clave,marca,raiz,directorio:datos,sistema:i.sistema};validarIdentidad({...m,base:'postgres'},i);await admin.query('CREATE DATABASE sistema_web_documental_final');}finally{await admin.end();}
 env.PGDATABASE=m.base;
 const manifest=path.join(raiz,'manifiesto.json');await fs.writeFile(manifest,JSON.stringify(m),{mode:0o600});
 const temporal=path.join(raiz,'temporales'),cwd=path.join(raiz,'ejecucion');await fs.mkdir(temporal);await fs.mkdir(cwd);
 const testEnv={...limpio,NODE_ENV:'test',DB_PROFILE:'local',PORT:'3000',CORS_ORIGINS:'',TRUST_PROXY_HOPS:'0',DATABASE_URL:url,JWT_SECRET:randomBytes(48).toString('hex'),DOTENV_CONFIG_PATH:path.join(cwd,'.env'),POSTGRES_TEST_MANIFEST:manifest,TEMP:temporal,TMP:temporal,TMPDIR:temporal};
 await fs.writeFile(testEnv.DOTENV_CONFIG_PATH,'DATABASE_URL='+url+'\nJWT_SECRET='+testEnv.JWT_SECRET+'\nNODE_ENV=test\n',{mode:0o600});
 // Verificar también la base efectiva antes de aplicar su DDL y datos sintéticos.
 const c=new pg.Client({connectionString:url});await c.connect();try{validarIdentidad(m,(await c.query(consultaIdentidad)).rows[0]);}finally{await c.end();}
 const fuente=await fs.readFile(path.resolve(backend,'../database/sistema_documental_instalacion.sql'),'utf8');
 // pg_dump deja search_path vacío; las semillas finales del archivo no están calificadas.
 // Ajuste exclusivo de la copia temporal de pruebas, sin reescribir el SQL de producto.
 if(fuente.split('\nINSERT INTO roles(').length!==2)throw Error('No se reconoce el bloque de semillas del esquema de prueba');
 const esquema=path.join(raiz,'esquema-prueba.sql');
 await fs.writeFile(esquema,fuente.replace('\nINSERT INTO roles(','\nSET search_path = public;\nINSERT INTO roles('));
 await bin('psql',['-X','-v','ON_ERROR_STOP=1','-f',esquema]);
 await bin('psql',['-X','-v','ON_ERROR_STOP=1','-f',path.resolve(backend,'../database/changes/007-retencion-pdf-anulados.sql')]);
 await bin('psql',['-X','-v','ON_ERROR_STOP=1','-f',path.resolve(backend,'../database/changes/008-relevo-oficina.sql')]);
 await bin('psql',['-X','-v','ON_ERROR_STOP=1','-f',path.resolve(backend,'../database/changes/009-grupos-documentales.sql')]);
 await bin('psql',['-X','-v','ON_ERROR_STOP=1','-f',path.resolve(backend,'../database/changes/010-nombre-visible-roles.sql')]);
 await bin('psql',['-X','-v','ON_ERROR_STOP=1','-f',path.resolve(backend,'../database/changes/011-consulta-delegaciones.sql')]);
 for(const key of Object.keys(process.env))if(/^(PG|R2_|NEON_|RENDER$)/.test(key))delete process.env[key];
 Object.assign(process.env,testEnv);
 const fixture=await crearFixtures();
 console.log(JSON.stringify({suite:modo,host:m.host,puerto,base:m.base,clusterVerificado:true,fixtures:fixture}));
 const r=await ejecutar(process.execPath,['--test','--test-concurrency=1',...suites[modo].map(f=>path.join(backend,'tests',f))],{env:testEnv,cwd,stdio:'inherit'});
 process.exitCode=r.code??1;
}finally{
 await cerrar();
}
