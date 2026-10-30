import { File } from 'node:buffer';
import { TextDecoder } from 'node:util';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'vite';
import { z } from 'zod';
const resultado=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:'src/features/documentos/api/pdf.api.ts',formats:['es']}}});
const chunk=(Array.isArray(resultado)?resultado:[resultado]).flatMap(r=>r.output).find(r=>r.type==='chunk'&&r.isEntry);
const api=await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
const vacio={archivo:null,modificar:true,limpieza_pendiente:0};
const file=new File(['%PDF-1.7 fixture'],'registro.pdf',{type:'application/pdf'});

test('Selección PDF opcional: rechazo temprano de formato y tamaño',()=>{
    api.comprobarSeleccion(file);
    for(const archivo of [new File(['x'],'registro.txt',{type:'text/plain'}),new File([],'vacio.pdf',{type:'application/pdf'}),new File([new Uint8Array(api.MAX_PDF+1)],'grande.pdf',{type:'application/pdf'})])assert.throws(()=>api.comprobarSeleccion(archivo));
});
test('Consulta, carga, confirmación y descarga usan transportes y contratos privados separados',async()=>{
    const original=globalThis.fetch;const peticiones=[];
    globalThis.fetch=async(ruta,opciones)=>{
        peticiones.push({ruta,opciones});
        if(ruta==='https://r2.invalid/upload')return new Response('',{status:200});
        if(ruta.endsWith('/cargas'))return Response.json({carga:'fixture',url:'https://r2.invalid/upload',headers:{'Content-Type':'application/pdf','If-None-Match':'*'}});
        if(ruta.endsWith('/abrir'))return Response.json({url:'https://r2.invalid/download',vence_en:60});
        return Response.json(vacio);
    };
    try{
        const pedir=api.clientePdf('jwt-fixture','1');
        assert.deepEqual(await pedir('consultar',{},api.estadoPdfSchema),vacio);
        await api.subirPdf(pedir,file,null);
        assert.equal(peticiones.length,4);assert.equal(JSON.parse(peticiones[1].opciones.body).revision,null);
        const put=peticiones[2];assert.equal(put.opciones.method,'PUT');assert.equal(put.opciones.headers.Authorization,undefined);assert.equal(put.opciones.credentials,'omit');assert.equal(put.opciones.headers['If-None-Match'],'*');
        assert.equal(peticiones[3].ruta,'/api/documentos/1/pdf/confirmar');
        await pedir('abrir',{descargar:true},z.object({url:z.string(),vence_en:z.number()}));
        assert.equal(JSON.parse(peticiones.at(-1).opciones.body).descargar,true);
    }finally{globalThis.fetch=original;}
});
test('Reemplazo conserva revisión y no confirma si falla PUT',async()=>{
    const original=globalThis.fetch;const acciones=[];
    const pedir=async(accion,datos)=>{acciones.push({accion,datos});return {carga:'id',url:'https://r2.invalid/upload',headers:{}};};
    globalThis.fetch=async()=>new Response('',{status:503});
    try{await assert.rejects(api.subirPdf(pedir,file,'revision-previa'),/anterior se conserva/);assert.deepEqual(acciones.map(a=>a.accion),['iniciar']);assert.equal(acciones[0].datos.revision,'revision-previa');}finally{globalThis.fetch=original;}
});
test('La interfaz propaga rechazo de confirmación y no anuncia éxito por un PUT exitoso',async()=>{
    const original=globalThis.fetch;
    globalThis.fetch=async()=>new Response('');
    try{await assert.rejects(api.subirPdf(async accion=>{if(accion==='confirmar')throw Error('conflicto');return {carga:'id',url:'https://r2.invalid/upload',headers:{}};},file,null),/conflicto/);}finally{globalThis.fetch=original;}
});
test('SíseVe exige clave por fase y la envía exclusivamente al backend en body',async()=>{
    const original=globalThis.fetch;const peticiones=[];let claves=0;
    globalThis.fetch=async(ruta,opciones)=>{peticiones.push({ruta,opciones});return Response.json({resultado:vacio});};
    try{
        const pedir=api.clientePdf('jwt-fixture','7',async()=>{claves++;return 'clave-fixture';});
        for(const accion of ['consultar','eliminar'])await pedir(accion,{},api.estadoPdfSchema);
        assert.equal(claves,2);
        for(const p of peticiones){assert.equal(p.ruta,'/api/siseve/operaciones');assert.equal(JSON.parse(p.opciones.body).clave,'clave-fixture');assert.equal(p.ruta.includes('clave'),false);}
    }finally{globalThis.fetch=original;}
});
test('SíseVe descarta una respuesta pendiente si se pierde el contexto visible',async()=>{
    const original=globalThis.fetch;let completar;let vigente=true;
    globalThis.fetch=()=>new Promise(resolve=>{completar=resolve;});
    try{
        const pedir=api.clientePdf('jwt','1',()=> 'clave-fixture',()=>vigente);
        const pendiente=pedir('consultar',{},api.estadoPdfSchema);
        await new Promise(resolve=>setImmediate(resolve));
        vigente=false;completar(Response.json({resultado:vacio}));
        await assert.rejects(pendiente,/perdió su contexto/);
    }finally{globalThis.fetch=original;}
});

test('Visor interno: lectura privada, errores y pérdida de contexto sin exponer credenciales',async()=>{
    const original=globalThis.fetch;
    try {
        globalThis.fetch=async(url,opciones)=>{assert.equal(url,'https://r2.invalid/privado');assert.equal(opciones.credentials,'omit');assert.equal(opciones.referrerPolicy,'no-referrer');assert.equal(opciones.cache,'no-store');assert.equal(opciones.headers,undefined);return new Response('%PDF-1.7');};
        assert.equal(new TextDecoder().decode(await api.obtenerContenidoPdf('https://r2.invalid/privado',()=>true)),'%PDF-1.7');
        await assert.rejects(api.obtenerContenidoPdf('https://r2.invalid/privado',()=>false),/perdió su contexto/);
        globalThis.fetch=async()=>new Response('',{status:403});await assert.rejects(api.obtenerContenidoPdf('https://r2.invalid/privado',()=>true),/No se pudo obtener/);
        globalThis.fetch=async()=>new Response('',{headers:{'content-length':String(15*1024*1024+1)}});await assert.rejects(api.obtenerContenidoPdf('https://r2.invalid/privado',()=>true),/supera el tamaño/);
        globalThis.fetch=async()=>new Response('');await assert.rejects(api.obtenerContenidoPdf('https://r2.invalid/privado',()=>true),/tamaño inválido/);
    }finally{globalThis.fetch=original;}
});
