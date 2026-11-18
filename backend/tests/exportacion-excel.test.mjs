import assert from 'node:assert/strict';
import {test} from 'node:test';
import ExcelJS from 'exceljs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const ruta='../dist/modules/documentos/exportacion.excel.js';
let modulo;try{modulo=await import(ruta);}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}

test('XLSX: valida año/mes estrictamente, sin ampliar filtros ni aceptar coerciones ambiguas',()=>{
 assert.ok(modulo,'Servicio de exportación disponible');
 for(const v of [{anio:'2026',mes:'11'},{anio:'1900',mes:'01'},{anio:'9999',mes:'12'}])assert.equal(modulo.periodoExportacion.safeParse(v).success,true);
 for(const v of [{anio:'2026',mes:'13'},{anio:'2026',mes:'0'},{anio:'1899',mes:'11'},{anio:'2026.0',mes:'11'},{anio:['2026'],mes:'11'},{anio:'2026',mes:'11',ambito_id:'1'},{anio:'2026',mes:'11',pagina:'1'}])assert.equal(modulo.periodoExportacion.safeParse(v).success,false);
});

test('XLSX real: tipos, textos seguros, opcionales históricos completos, hoja vacía y limpieza',async()=>{
 assert.ok(modulo,'Servicio de exportación disponible');
 const dir=await mkdtemp(join(tmpdir(),'prueba-excel-'));try{
 const fecha=new Date('2026-11-01T04:30:00Z');
 const datos={codigo:'INF2026001',tipo:'Informe',asunto:'=HYPERLINK("https://privado.invalid","abrir")',clasificacion:'RECIBIDO',remitente:'+SUM(1,2)',observaciones:'@dato',registrador:'Persona autorizada',situacion:'CON_DELEGACION',registro:fecha,actualizacion:new Date('2026-12-01T12:00:00Z'),oficina:'Dirección',ubicacion_oficina:'Dirección',ubicacion:'Estante A / Informes',ubicacion_fecha:fecha,delegado:'Persona indicada',delegacion_oficina:'Mesa de Partes',delegado_por:'Directora',delegacion_fecha:new Date('2026-12-01T12:00:00Z'),delegacion_observaciones:'-Pendiente',opcionales:[{nombre:'Etiqueta histórica',valor:'😀'.repeat(18000)},{nombre:'=Nombre',valor:'=1+1'}],pdf_nombre:'archivo.pdf',pdf_bytes:12345,pdf_mime:'application/pdf',pdf_fecha:fecha};
 const archivo=join(dir,'datos.xlsx');await modulo.escribirExcel(archivo,[datos],new Date('2026-12-02T12:00:00Z'));
 const libro=new ExcelJS.Workbook();await libro.xlsx.load(await readFile(archivo));const hoja=libro.getWorksheet('Documentos');
 assert.equal(hoja.rowCount,2);assert.equal(hoja.getCell('C2').type,ExcelJS.ValueType.String);assert.equal(hoja.getCell('C2').value,datos.asunto);assert.equal(hoja.getCell('E2').value,'+SUM(1,2)');
 assert.equal(hoja.getCell('I2').type,ExcelJS.ValueType.Date);assert.equal(hoja.getCell('I2').value.toISOString(),'2026-10-31T23:30:00.000Z');
 assert.equal(hoja.getCell('U2').type,ExcelJS.ValueType.Number);assert.equal(hoja.getCell('U2').value,12345);assert.equal(hoja.getCell('H2').value,'Con delegación');assert.equal(hoja.views[0].state,'frozen');assert.equal(hoja.views[0].ySplit,1);assert.ok(hoja.autoFilter);
 const opcionales=[];hoja.getRow(1).eachCell((celda,col)=>{if(String(celda.value).startsWith('Campos opcionales'))opcionales.push(hoja.getCell(2,col).value??'');});
 assert.equal(opcionales.join(''),'Etiqueta histórica: '+datos.opcionales[0].valor+'\n=Nombre: =1+1');assert.ok(opcionales.length>1);
 hoja.eachRow(row=>row.eachCell(cell=>{assert.notEqual(cell.type,ExcelJS.ValueType.Formula);assert.notEqual(cell.type,ExcelJS.ValueType.Hyperlink);if(typeof cell.value==='string')assert.ok(cell.value.length<=32767);}));
 const vacio=join(dir,'vacio.xlsx');await modulo.escribirExcel(vacio,[],new Date());const v=new ExcelJS.Workbook();await v.xlsx.readFile(vacio);assert.equal(v.getWorksheet('Documentos').rowCount,1);assert.equal(v.getWorksheet('Documentos').getCell('A1').value,'Código');
 }finally{await rm(dir,{recursive:true,force:true});}
});
