import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes} from 'node:crypto';
import {URL} from 'node:url';
import {Readable} from 'node:stream';
import {PDFDocument} from 'pdf-lib';
import {S3Client,HeadObjectCommand,GetObjectCommand,CopyObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {crearAlmacenS3} from '../dist/modules/documentos-pdf/pdf.storage.js';
test('R2 reutilizado: firma, validación real, copia condicional, lectura privada y fallos de eliminación',async()=>{
 const p=await PDFDocument.create();p.addPage();const bytes=await p.save();
 const s3=new S3Client({region:'auto',endpoint:'https://storage.invalid',credentials:{accessKeyId:randomBytes(16).toString('hex'),secretAccessKey:randomBytes(32).toString('hex')},requestChecksumCalculation:'WHEN_REQUIRED'});
 let mime='application/pdf',contenido=bytes,falloBorrado=false,ausente=false,falloHead=false;const comandos=[];
 s3.send=async c=>{comandos.push(c);if(c instanceof HeadObjectCommand&&falloHead)throw Object.assign(Error('HEAD denegado'),{$metadata:{httpStatusCode:403}});if(c instanceof HeadObjectCommand&&ausente)throw Object.assign(Error('No encontrado'),{$metadata:{httpStatusCode:404}});if(c instanceof HeadObjectCommand)return {ContentLength:bytes.length,ContentType:mime,ETag:'"prueba"'};if(c instanceof GetObjectCommand)return {Body:Readable.from([contenido])};if(c instanceof DeleteObjectCommand&&falloBorrado)throw Error('Fallo de almacenamiento simulado');return {};};
 try{
  const storage=crearAlmacenS3(s3,'solo-simulacion'),subida=new URL(await storage.subir('tmp/id',bytes.length));
  assert.match(subida.searchParams.get('X-Amz-SignedHeaders'),/if-none-match/);assert.equal(subida.searchParams.get('X-Amz-Expires'),'300');
  await storage.validarYCopiar('tmp/id','pdf/id',bytes.length);assert.equal(comandos.find(c=>c instanceof CopyObjectCommand).input.CopySourceIfMatch,'"prueba"');
  mime='text/plain';await assert.rejects(storage.validarYCopiar('tmp/id','pdf/id',bytes.length));mime='application/pdf';
  contenido=new Uint8Array(bytes.length);await assert.rejects(storage.validarYCopiar('tmp/id','pdf/id',bytes.length));
  const descarga=new URL(await storage.abrir('pdf/id','archivo.pdf',true));assert.equal(descarga.searchParams.get('X-Amz-Expires'),'60');
  falloBorrado=true;await assert.rejects(storage.eliminar('pdf/id'));falloBorrado=false;await assert.rejects(storage.eliminar('pdf/id'),/ausencia/);falloHead=true;await assert.rejects(storage.eliminar('pdf/id'));falloHead=false;ausente=true;await storage.eliminar('pdf/id');assert.ok(comandos.at(-1) instanceof HeadObjectCommand);
 }finally{s3.destroy();}
});
