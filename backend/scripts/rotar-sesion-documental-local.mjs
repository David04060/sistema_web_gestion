import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {parse} from 'dotenv';
import {URL} from 'node:url';
const texto=fs.readFileSync('.env','utf8');
if(new URL(parse(texto).DATABASE_URL).pathname!=='/sistema_web_documental_final')throw Error('Se requiere base nueva local');
const secreto=randomBytes(48).toString('hex');
fs.writeFileSync('.env',texto.replace(/^JWT_SECRET=.*$/m,'JWT_SECRET='+secreto));
console.log('Secreto de sesión local renovado; tokens de la base anterior no serán reutilizables.');
