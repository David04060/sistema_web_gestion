import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve,sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
const ejecutar=promisify(execFile);
const bin=process.env.PDF_TEST_PG_BIN??'C:/Program Files/PostgreSQL/18/bin';

/** Cluster temporal independiente, sin leer .env ni conectarse a una base institucional. */
test('005 y repositorio PDF en PostgreSQL efímero: integridad, bloqueo, rollback y limpieza real de metadatos',async(t)=>{
    const carpeta=await mkdtemp(join(tmpdir(),'documental-pdf-qa-'));
    assert.ok(resolve(carpeta).startsWith(resolve(tmpdir())+sep));
    const datos=join(carpeta,'datos');let iniciado=false;let poolApp;
    const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));
    const puerto=listener.address().port;await new Promise(r=>listener.close(r));
    const comando=async(nombre,args)=>ejecutar(join(bin,`${nombre}.exe`),args,{windowsHide:true,timeout:60_000,maxBuffer:1024*1024});
    try{
        await comando('initdb',['-D',datos,'-U','pdf_qa_owner','-A','trust','--encoding=UTF8','--no-locale']);
        await comando('pg_ctl',['-D',datos,'-l',join(carpeta,'postgres.log'),'-o',`-h 127.0.0.1 -p ${puerto}`,'-w','start']);iniciado=true;
        const owner=new pg.Client({connectionString:`postgresql://pdf_qa_owner@127.0.0.1:${puerto}/postgres`});await owner.connect();
        try{
            await owner.query('CREATE ROLE sistema_web_app LOGIN');
            await owner.query('CREATE DATABASE pdf_qa_aislada');
        }finally{await owner.end();}
        const fixture=new pg.Client({connectionString:`postgresql://pdf_qa_owner@127.0.0.1:${puerto}/pdf_qa_aislada`});await fixture.connect();
        try{
            await fixture.query('CREATE TABLE usuarios(id bigint PRIMARY KEY); CREATE TABLE documentos(id bigint PRIMARY KEY); INSERT INTO usuarios VALUES(1); INSERT INTO documentos VALUES(1); GRANT SELECT,UPDATE ON documentos,usuarios TO sistema_web_app');
            await fixture.query(await readFile(new URL('../scripts/sql/produccion-vigente/005-documentos-pdf.sql',import.meta.url),'utf8'));
        }finally{await fixture.end();}
        process.env.NODE_ENV='test';process.env.DATABASE_URL=`postgresql://sistema_web_app@127.0.0.1:${puerto}/pdf_qa_aislada`;
        process.env.JWT_SECRET='secreto-solo-fixture-pdf-postgresql-000000000';
        const {pool}=await import('../dist/config/database.js');poolApp=pool;
        const repo=await import('../dist/modules/documentos-pdf/pdf.repository.js');
        const {limpiarPdf}=await import('../dist/modules/documentos-pdf/pdf.service.js');
        const identidad=(await pool.query('SELECT current_database() base,current_user usuario,inet_server_port() puerto')).rows[0];
        assert.deepEqual(identidad,{base:'pdf_qa_aislada',usuario:'sistema_web_app',puerto});
        const almacenamiento=new Set();let falla=false;
        const almacen=()=>({eliminar:async clave=>{if(falla)throw Error('R2 falló');almacenamiento.delete(clave);}});
        const carga=revision=>({id:randomUUID(),documento_id:'1',actor_id:'1',temporal:`tmp/${randomUUID()}`,definitiva:`pdf/${randomUUID()}`,nombre:'ficticio.pdf',tamano:100,revision,vence:new Date(Date.now()+600_000),confirmado:false});
        async function preparar(revision){const d=carga(revision);const c=await pool.connect();try{await c.query('BEGIN');await repo.crear(c,d);await c.query('COMMIT');}finally{c.release();}return d;}
        async function confirmar(d){const c=await pool.connect();try{
            await c.query('BEGIN');await c.query('SELECT id FROM documentos WHERE id=$1 FOR UPDATE',['1']);
            const previo=await repo.vigente('1',c);if((previo?.revision??null)!==d.revision)throw Error('Revisión obsoleta');
            await repo.vincular(c,d);almacenamiento.add(d.definitiva);
            if(previo)await repo.programar(c,previo.clave);await repo.evento(c,'1','1',previo?'REEMPLAZO':'CARGA',d.id);await c.query('COMMIT');
        }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
        await t.test('Migración permite documentos previos sin PDF y FK/PK protegen el vínculo',async()=>{
            assert.equal(await repo.vigente('1'),undefined);const d=await preparar(null);await confirmar(d);
            await assert.rejects(pool.query('INSERT INTO documentos_pdf SELECT * FROM documentos_pdf'),e=>e.code==='23505');
            assert.equal((await pool.query('SELECT count(*)::int n FROM documentos')).rows[0].n,1);
        });
        await t.test('Dos conexiones reales serializan reemplazos y rechazan una revisión obsoleta',async()=>{
            const viejo=await repo.vigente('1');const a=await preparar(viejo.revision),b=await preparar(viejo.revision);
            const r=await Promise.allSettled([confirmar(a),confirmar(b)]);assert.equal(r.filter(v=>v.status==='fulfilled').length,1);
            await limpiarPdf(20,'1',almacen);assert.equal(almacenamiento.has(viejo.clave),false);assert.ok(almacenamiento.has((await repo.vigente('1')).clave));
        });
        await t.test('Rollback de desvinculación conserva el vigente y su auditoría',async()=>{
            const previo=await repo.vigente('1');const c=await pool.connect();try{await c.query('BEGIN');await repo.retirar(c,'1');await repo.evento(c,'1','1','ELIMINACION',previo.revision);await c.query('ROLLBACK');}finally{c.release();}
            assert.equal((await repo.vigente('1')).clave,previo.clave);
        });
        await t.test('SKIP LOCKED evita limpiar objetos bloqueados por una confirmación',async()=>{
            const d=await preparar((await repo.vigente('1')).revision);await pool.query("UPDATE pdf_objetos SET limpiar_desde='2000-01-01' WHERE clave=$1",[d.definitiva]);
            almacenamiento.add(d.definitiva);const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT clave FROM pdf_objetos WHERE clave=$1 FOR UPDATE',[d.definitiva]);await limpiarPdf(20,'1',almacen);assert.ok(almacenamiento.has(d.definitiva));await c.query('ROLLBACK');}finally{c.release();}
            await limpiarPdf(20,'1',almacen);assert.equal(almacenamiento.has(d.definitiva),false);
        });
        await t.test('Eliminación, fallo físico, backoff visible, reintento y temporales vencidos',async()=>{
            const p=await repo.vigente('1');const c=await pool.connect();try{await c.query('BEGIN');await repo.retirar(c,'1');await repo.programar(c,p.clave);await repo.evento(c,'1','1','ELIMINACION',p.revision);await c.query('COMMIT');}finally{c.release();}
            falla=true;assert.ok((await limpiarPdf(20,'1',almacen)).pendientes>0);assert.ok(await repo.pendientes('1')>0);assert.ok(almacenamiento.has(p.clave));
            falla=false;await pool.query("UPDATE pdf_objetos SET limpiar_desde='2000-01-01' WHERE eliminado_en IS NULL");await limpiarPdf(50,'1',almacen);
            assert.equal(almacenamiento.size,0);assert.equal(await repo.vigente('1'),undefined);assert.equal(await repo.pendientes('1'),0);
            const eventos=(await pool.query('SELECT accion,actor_id::text FROM pdf_eventos')).rows;assert.ok(eventos.some(e=>e.accion==='ELIMINACION'&&e.actor_id==='1'));assert.ok(eventos.some(e=>e.accion==='LIMPIEZA_COMPLETADA'));
        });
    }finally{
        if(poolApp)await poolApp.end();
        if(iniciado)await comando('pg_ctl',['-D',datos,'-m','fast','-w','stop']);
        // Solo nuestra carpeta mkdtemp validada; nunca rutas suministradas por configuración institucional.
        await rm(carpeta,{recursive:true,force:true});
    }
});
