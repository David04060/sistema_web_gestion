import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { serialize,deserialize } from 'node:v8';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { Readable } from 'node:stream';
import { S3Client,HeadObjectCommand,GetObjectCommand,CopyObjectCommand } from '@aws-sdk/client-s3';
process.env.DATABASE_URL='postgresql://fixture:fixture@127.0.0.1:1/fixture';
process.env.JWT_SECRET='secreto-exclusivo-de-pruebas-pdf-0000000000';
process.env.NODE_ENV='test';
const {pool}=await import('../dist/config/database.js');
const {servicioPdf,limpiarPdf}=await import('../dist/modules/documentos-pdf/pdf.service.js');
const {validarPdf,crearAlmacenR2,crearAlmacenS3,prefijoPdf}=await import('../dist/modules/documentos-pdf/pdf.storage.js');
const {iniciarSchema,eliminarSchema,MAX_PDF}=await import('../dist/modules/documentos-pdf/pdf.schema.js');
const {operar}=await import('../dist/modules/siseve/siseve.service.js');
const {operacionSchema}=await import('../dist/modules/siseve/siseve.schema.js');
const {generarHash}=await import('../dist/shared/security/password.js');
const {clienteDocumental}=await import('../dist/shared/documental/contexto.js');

test('Prefijo QA explícito y seguro; producción conserva claves sin prefijo',()=>{
    const anterior=process.env.R2_PDF_PREFIX;
    try {
        delete process.env.R2_PDF_PREFIX; assert.equal(prefijoPdf(),'');
        process.env.R2_PDF_PREFIX='qa/pdf-validacion-local/'; assert.equal(prefijoPdf(),'qa/pdf-validacion-local/');
        for(const valor of ['../','/pdf/','qa','https://bucket/','qa//','qa/../']) {
            process.env.R2_PDF_PREFIX=valor; assert.throws(prefijoPdf,e=>e.status===503);
        }
    } finally { if(anterior===undefined)delete process.env.R2_PDF_PREFIX;else process.env.R2_PDF_PREFIX=anterior; }
});

test('Validación real PDF: estructura, firma, longitud, tipo, tamaño y confirmación',async()=>{
    const p=await PDFDocument.create();p.addPage();const bytes=await p.save();
    await validarPdf(bytes,bytes.length);
    await assert.rejects(validarPdf(Buffer.from('%PDF-1.7\nNO ES PDF\n%%EOF'),29));
    await assert.rejects(validarPdf(Buffer.from('<html>PDF</html>'),16));
    await assert.rejects(validarPdf(bytes,bytes.length+1));
    await assert.rejects(validarPdf(new Uint8Array(MAX_PDF+1),MAX_PDF+1));
    const empty=await PDFDocument.create();const vacio=await empty.save({addDefaultPage:false});await assert.rejects(validarPdf(vacio,vacio.length));
    const datos={nombre:'registro.pdf',tamano:bytes.length,mime:'application/pdf',revision:null};
    assert.equal(iniciarSchema.safeParse(datos).success,true);
    for(const d of [{tamano:MAX_PDF+1},{tamano:0},{mime:'text/html'},{nombre:'../secreto.pdf'},{nombre:'archivo.exe'}])assert.equal(iniciarSchema.safeParse({...datos,...d}).success,false);
    assert.equal(eliminarSchema.safeParse({revision:randomUUID(),confirmar:false}).success,false);
    assert.throws(crearAlmacenR2,/configurado/);
});

test('Adaptador R2: firma condicional, validación HEAD/bytes y copia condicionada sin red',async()=>{
    const p=await PDFDocument.create();p.addPage();const bytes=await p.save();
    const client=new S3Client({region:'auto',endpoint:'https://fixture.r2.cloudflarestorage.com',credentials:{accessKeyId:'fixture',secretAccessKey:'fixture'},requestChecksumCalculation:'WHEN_REQUIRED'});
    let head={ContentLength:bytes.length,ContentType:'application/pdf',ETag:'"fixture-etag"'};
    let contenido=bytes;const commands=[];
    client.send=async command=>{
        commands.push(command);
        if(command instanceof HeadObjectCommand)return head;
        if(command instanceof GetObjectCommand)return {Body:Readable.from([contenido])};
        return {};
    };
    try{
        const storage=crearAlmacenS3(client,'bucket-ficticio-pdf');
        const url=new URL(await storage.subir('tmp/aleatorio',bytes.length));
        assert.match(url.searchParams.get('X-Amz-SignedHeaders'),/if-none-match/);
        assert.match(url.searchParams.get('X-Amz-SignedHeaders'),/content-type/);
        assert.equal(url.searchParams.get('X-Amz-Expires'),'300');
        await storage.validarYCopiar('tmp/aleatorio','pdf/otro',bytes.length);
        const copy=commands.find(c=>c instanceof CopyObjectCommand);assert.equal(copy.input.CopySourceIfMatch,'"fixture-etag"');assert.equal(copy.input.Key,'pdf/otro');
        for(const cambio of [{ContentLength:MAX_PDF+1},{ContentType:'text/html'}]){const previo=head;head={...head,...cambio};await assert.rejects(storage.validarYCopiar('tmp/aleatorio','pdf/otro',bytes.length));head=previo;}
        contenido=Buffer.from('%PDF-1.7 falso');await assert.rejects(storage.validarYCopiar('tmp/aleatorio','pdf/otro',bytes.length));
        const get=new URL(await storage.abrir('pdf/otro','informe.pdf',true));assert.equal(get.searchParams.get('X-Amz-Expires'),'60');assert.match(get.searchParams.get('response-content-disposition'),/^attachment/);
    }finally{client.destroy();}
});

test('Ciclo PDF con PostgreSQL y R2 simulados: permisos, carreras, rollback y limpieza',async(t)=>{
    const original={query:pool.query,connect:pool.connect};
    const doc={id:'1',registrado_por_id:'1',responsable_actual_id:'1',activo:true,estado_tramite:'RECIBIDO'};
    const actores={1:{id:'1',rol:'Usuario',activo:true,oficina_id:'1'},2:{id:'2',rol:'Usuario',activo:true,oficina_id:'1'},3:{id:'3',rol:'Director(a)',activo:true,oficina_id:'2'},4:{id:'4',rol:'Administrador',activo:true,oficina_id:'1'}};
    let actual;let cargas=new Map();let objetos=new Map();let eventos=[];let abierto=false;let restringido=false;
    let falloCopia=false,falloBorrado=false,falloVinculo=false,errorLecturaPdf;
    let siseveAutorizado=false;const hash=await generarHash('Clave-fixture-123');
    const r2=new Map();const consultadas=[];
    let cola=Promise.resolve();
    async function query(sql,p=[]){
        consultadas.push(sql);
        const rows=[];
        if(sql.includes('SELECT u.id::text,u.oficina_id'))rows.push(actores[p[0]]);
        else if(sql.startsWith('SELECT situacion,tipo,usuario_id')){ /* Fixture ordinario sin decisión institucional. */ }
        else if(sql.includes('FROM documentos d JOIN tipos_documentales')){
            if((!restringido||clienteDocumental()) && ['1','3'].includes(p[0]))rows.push({...doc});
        }
        else if(sql.startsWith('SELECT id::text FROM tipos_documentales'))rows.push({id:'9'});
        else if(sql.startsWith('SELECT activo FROM autorizaciones_tipos_restringidos'))rows.push({activo:siseveAutorizado});
        else if(sql.startsWith('SELECT clave_hash FROM claves_tipos_documentales'))rows.push({clave_hash:hash});
        else if(sql.includes('FROM movimientos_documentales')){if(abierto)rows.push({id:'mov'});}
        else if(sql.startsWith('SELECT revision,clave')){if(errorLecturaPdf)throw errorLecturaPdf;if(actual)rows.push({...actual});}
        else if(sql.startsWith('SELECT count(*) n FROM pdf_objetos'))rows.push({n:[...objetos.values()].filter(o=>!o.eliminado_en&&o.clave.startsWith('pdf/')&&o.clave!==actual?.clave).length});
        else if(sql.startsWith('SELECT count(*) n FROM pdf_cargas'))rows.push({n:0});
        else if(sql.startsWith('INSERT INTO pdf_cargas'))cargas.set(p[0],{id:p[0],documento_id:p[1],actor_id:p[2],temporal:p[3],definitiva:p[4],nombre:p[5],tamano:p[6],revision:p[7],vence:p[8],confirmado:false});
        else if(sql.startsWith('INSERT INTO pdf_objetos'))for(const clave of p.slice(0,2))objetos.set(clave,{clave,documento_id:p[2],limpiar_desde:p[3],eliminado_en:null});
        else if(sql.startsWith('SELECT *,documento_id::text')){const c=cargas.get(p[0]);if(c&&c.documento_id===p[1]&&c.actor_id===p[2])rows.push(c);}
        else if(sql.startsWith('INSERT INTO documentos_pdf')){if(falloVinculo)throw Error('fallo commit simulado');actual={revision:p[1],clave:p[2],nombre:p[3],tamano:p[4],cargado_en:new Date().toISOString()};}
        else if(sql.startsWith('UPDATE pdf_cargas SET confirmado'))cargas.get(p[0]).confirmado=true;
        else if(sql.startsWith('UPDATE pdf_objetos SET limpiar_desde'))objetos.get(p[0]).limpiar_desde=new Date(0);
        else if(sql.startsWith('DELETE FROM documentos_pdf'))actual=undefined;
        else if(sql.startsWith('INSERT INTO pdf_eventos'))eventos.push({accion:p[2],actor:p[1]});
        else if(sql.includes('SELECT o.clave,o.documento_id'))rows.push(...[...objetos.values()].filter(o=>!o.eliminado_en&&new Date(o.limpiar_desde)<=new Date()&&o.clave!==actual?.clave).slice(0,p[0]));
        else if(sql.startsWith('UPDATE pdf_objetos SET eliminado_en'))objetos.get(p[0]).eliminado_en=new Date();
        else if(sql.startsWith('UPDATE pdf_objetos SET intentos'))objetos.get(p[0]).limpiar_desde=new Date(Date.now()+60_000);
        else if(!['SELECT clave FROM pdf_objetos','SELECT id FROM documentos','SELECT set_config','SELECT pg_advisory'].some(v=>sql.startsWith(v)))throw Error(`SQL sin simular: ${sql.slice(0,100)}`);
        return {rows,rowCount:rows.length};
    }
    pool.query=query;
    pool.connect=async()=>{
        let liberar;const anterior=cola;cola=new Promise(r=>liberar=r);await anterior;
        let snapshot;
        return {release:()=>liberar(),query:async(sql,p)=>{
            if(sql==='BEGIN'){snapshot=deserialize(serialize({actual,cargas,objetos,eventos}));return {rows:[]};}
            if(sql==='COMMIT')return {rows:[]};
            if(sql==='ROLLBACK'){({actual,cargas,objetos,eventos}=snapshot);return {rows:[]};}
            return query(sql,p);
        }};
    };
    const almacen=()=>({
        subir:async clave=>`https://r2.invalid/${clave}`,
        validarYCopiar:async(a,b,size)=>{if(falloCopia)throw Error('R2 no disponible');const bytes=r2.get(a);if(!bytes)throw Error('NoSuchKey');await validarPdf(bytes,size);r2.set(b,bytes);},
        abrir:async(clave,nombre,descargar)=>{assert.ok(r2.has(clave));return `https://r2.invalid/${clave}?attachment=${descargar}&name=${encodeURIComponent(nombre)}`;},
        eliminar:async clave=>{if(falloBorrado)throw Error('R2 delete falló');r2.delete(clave);},
    });
    const api=servicioPdf(almacen);const p=await PDFDocument.create();p.addPage();const bytes=await p.save();
    const datos=revision=>({nombre:'registro.pdf',tamano:bytes.length,mime:'application/pdf',revision});
    async function preparar(revision=null){const r=await api.iniciar('1','1',datos(revision));const c=cargas.get(r.carga);r2.set(c.temporal,bytes);return c;}
    try{
        await t.test('GET sin adjunto funciona sin inicializar R2; configuración ausente se distingue del esquema',async()=>{
            let llamadas=0;
            const sinR2=servicioPdf(()=>{llamadas++;return crearAlmacenR2();});
            assert.deepEqual(await sinR2.consultar('1','1'),{archivo:null,modificar:true,limpieza_pendiente:0});
            assert.equal(llamadas,0);
            const antes=cargas.size;
            await assert.rejects(sinR2.iniciar('1','1',datos(null)),e=>e.status===503&&e.message==='Almacenamiento PDF no configurado');
            assert.equal(cargas.size,antes,'La ausencia de configuración no confirma intenciones en PostgreSQL');
        });
        await t.test('Errores reales de tabla, columna o privilegios no se convierten en archivo null',async()=>{
            for(const code of ['42P01','42703','42501']){
                errorLecturaPdf=Object.assign(new Error('Fallo SQL simulado'),{code});
                await assert.rejects(api.consultar('1','1'),e=>e===errorLecturaPdf&&e.code===code);
            }
            errorLecturaPdf=undefined;
        });
        await t.test('Documento registrado sin PDF permanece consultable; adjuntar posteriormente',async()=>{
            assert.equal((await api.consultar('1','1')).archivo,null);
            const c=await preparar();await api.confirmar('1','1',c.id);assert.equal(actual.revision,c.id);assert.ok(r2.has(actual.clave));
            assert.equal(doc.estado_tramite,'RECIBIDO');
        });
        await t.test('Visualizar/descargar y consulta de Dirección no permiten modificar ajenos ni compartir oficina',async()=>{
            assert.match((await api.abrir('3','1',false)).url,/attachment=false/);
            assert.match((await api.abrir('1','1',true)).url,/attachment=true/);
            assert.equal((await api.consultar('3','1')).modificar,false);
            for(const actor of ['2','3','4'])await assert.rejects(api.iniciar(actor,'1',datos(actual.revision)));
            await assert.rejects(api.consultar('4','1'));
            restringido=true;await assert.rejects(api.consultar('1','1'));restringido=false;
        });
        await t.test('Anulado/inactivo, traslado y pérdida de custodia bloquean modificaciones',async()=>{
            for(const cambio of [{activo:false},{estado_tramite:'EN_TRASLADO'},{responsable_actual_id:'2'}]){const previo={...doc};Object.assign(doc,cambio);await assert.rejects(api.iniciar('1','1',datos(actual.revision)));Object.assign(doc,previo);}
            abierto=true;await assert.rejects(api.iniciar('1','1',datos(actual.revision)));abierto=false;
        });
        await t.test('Carga fallida/archivo falso conserva PDF anterior',async()=>{
            const previo=actual.clave;const c=await preparar(actual.revision);falloCopia=true;await assert.rejects(api.confirmar('1','1',c.id));falloCopia=false;
            r2.set(c.temporal,Buffer.from('falso'));await assert.rejects(api.confirmar('1','1',c.id));assert.equal(actual.clave,previo);assert.ok(r2.has(previo));
        });
        await t.test('Reemplazo correcto elimina físicamente anterior y audita actor',async()=>{
            const previo=actual.clave;const c=await preparar(actual.revision);await api.confirmar('1','1',c.id);assert.notEqual(actual.clave,previo);
            await limpiarPdf(20,'1',almacen);assert.equal(r2.has(previo),false);assert.ok(r2.has(actual.clave));assert.ok(eventos.some(e=>e.accion==='REEMPLAZO'&&e.actor==='1'));
        });
        await t.test('Dos reemplazos simultáneos: solo uno confirma la revisión',async()=>{
            const revision=actual.revision;const a=await preparar(revision),b=await preparar(revision);
            const resultados=await Promise.allSettled([api.confirmar('1','1',a.id),api.confirmar('1','1',b.id)]);
            assert.equal(resultados.filter(r=>r.status==='fulfilled').length,1);assert.equal(resultados.filter(r=>r.status==='rejected').length,1);
        });
        await t.test('Fallo PostgreSQL tras copia deja objeto recogible sin cambiar vigente',async()=>{
            const previo=actual.clave,c=await preparar(actual.revision);falloVinculo=true;await assert.rejects(api.confirmar('1','1',c.id));falloVinculo=false;
            assert.equal(actual.clave,previo);assert.ok(r2.has(c.definitiva));objetos.get(c.definitiva).limpiar_desde=new Date(0);await limpiarPdf(20,'1',almacen);assert.equal(r2.has(c.definitiva),false);
        });
        await t.test('Eliminar contra reemplazo simultáneo no aplica una revisión obsoleta',async()=>{
            const rev=actual.revision,c=await preparar(rev);
            const resultados=await Promise.allSettled([api.confirmar('1','1',c.id),api.eliminar('1','1',rev)]);
            assert.equal(resultados.filter(r=>r.status==='fulfilled').length,1);
        });
        await t.test('Fallo DeleteObject registra pendiente, reintento borra, documento conservado',async()=>{
            const previo=actual.clave;await api.eliminar('1','1',actual.revision);falloBorrado=true;await limpiarPdf(20,'1',almacen);
            assert.equal(actual,undefined);assert.equal(doc.id,'1');assert.ok(r2.has(previo));assert.ok((await api.consultar('1','1')).limpieza_pendiente>0);
            assert.ok(eventos.some(e=>e.accion==='LIMPIEZA_PENDIENTE'));falloBorrado=false;for(const o of objetos.values())o.limpiar_desde=new Date(0);
            await limpiarPdf(50,'1',almacen);assert.equal(r2.has(previo),false);assert.equal(r2.size,0);
        });
        await t.test('Vencimiento y revalidación de autorización durante confirmación',async()=>{
            const c=await preparar();cargas.get(c.id).vence=new Date(0);await assert.rejects(api.confirmar('1','1',c.id));
            const nuevo=await preparar();doc.responsable_actual_id='2';await assert.rejects(api.confirmar('1','1',nuevo.id));doc.responsable_actual_id='1';
            assert.equal(consultadas.some(sql=>/^UPDATE documentos SET/.test(sql)),false);
        });
        await t.test('SíseVe: todas las operaciones PDF exigen clave y autorización individual en backend',async()=>{
            restringido=true;
            for(const operacion of ['pdf-consultar','pdf-iniciar','pdf-confirmar','pdf-eliminar','pdf-abrir']){
                assert.equal(operacionSchema.safeParse({operacion,id:'1',datos:{}}).success,false);
                await assert.rejects(operar('1',{operacion,id:'1',clave:'Clave-fixture-123',datos:{}}),e=>e.status===403);
            }
            siseveAutorizado=true;
            await assert.rejects(operar('1',{operacion:'pdf-consultar',id:'1',clave:'incorrecta',datos:{}}),e=>e.status===403);
            assert.equal((await operar('1',{operacion:'pdf-consultar',id:'1',clave:'Clave-fixture-123',datos:{}})).archivo,null);
            siseveAutorizado=false;
            await assert.rejects(operar('1',{operacion:'pdf-consultar',id:'1',clave:'Clave-fixture-123',datos:{}}),e=>e.status===403);
            restringido=false;
        });
    }finally{pool.query=original.query;pool.connect=original.connect;await pool.end();}
});
