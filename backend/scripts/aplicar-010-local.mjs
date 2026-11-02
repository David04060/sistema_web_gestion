import fs from 'node:fs';
import {parse} from 'dotenv';
import pg from 'pg';
import {verificarConexionLocal} from '../src/config/local.ts';
const url=parse(fs.readFileSync('.env')).DATABASE_URL,c=new pg.Client({connectionString:url});
try{await c.connect();await verificarConexionLocal(c,url);await c.query(fs.readFileSync('scripts/sql/010-matriz-permisos-local.sql','utf8'));console.log('010 aplicada en sistema_web_final local');}finally{await c.end();}
