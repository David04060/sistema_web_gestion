import { setTimeout as esperar } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import pg from 'pg';

// Sin .env, migración o elevación de permisos. Requiere preparación explícita en QA.
assert.equal(process.env.ARCHIVOS_QA_AUTORIZADA, 'SOLO_COPIA_LOCAL');
const rolEfectivo = process.env.ARCHIVOS_QA_ROL_EFECTIVO ?? 'sistema_documental_app';
assert.ok(['sistema_documental_app','sistema_web_app'].includes(rolEfectivo));
const url = new URL(process.env.DATABASE_URL);
assert.match(url.pathname, /^\/sistema_web_final_qa_archivo_[a-f0-9]{32}$/);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
const f = JSON.parse(process.env.ARCHIVOS_QA_FIXTURES);
Object.assign(process.env, { DB_PROFILE: 'local', RENDER: 'false', NODE_ENV: 'test',
    DOTENV_CONFIG_PATH: '.private/no-cargar-env-en-qa', JWT_SECRET: randomBytes(48).toString('hex'),
    CORS_ORIGINS: '', TRUST_PROXY_HOPS: '0', VINCULACION_ARCHIVOS_HABILITADA: 'true', PRIMER_INGRESO_ORDINARIO_HABILITADO: 'true', CICLO_INGRESOS_ORDINARIOS_HABILITADO:'true' });

test('Ciclo ordinario: HTTP y PostgreSQL con rol restringido', async t => {
    const c = new pg.Client({ connectionString: url.toString() }); await c.connect();
    const continuidadInstalada=(await c.query("SELECT to_regprocedure('public.fn_ai_continuidad_operacion()') IS NOT NULL v")).rows[0].v;
    async function guard(client = c) {
        const r = (await client.query(`SELECT current_database() db,current_user rol,inet_server_addr()::text host,inet_server_port() port,
          (SELECT oid::text FROM pg_database WHERE datname=current_database()) oid,
          (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) elevado`)).rows[0];
        assert.equal('/' + r.db, url.pathname); assert.equal(r.oid, process.env.ARCHIVOS_QA_OID);
        assert.equal(r.rol, rolEfectivo); assert.equal(r.elevado, false);
        assert.ok(['::1/128', '127.0.0.1/32'].includes(r.host)); assert.equal(r.port, Number(url.port || 5432));
    }
    try { await guard(); } catch(e) { console.log('GUARD',e.message); await c.end(); throw e; }
    let app,pool;try { ({app}=await import('../src/app.ts')); ({pool}=await import('../src/config/database.ts')); } catch(e){console.log(e);await c.end();throw e;}
    const pc = await pool.connect(); try {await guard(pc);} catch(e) {console.log('POOL GUARD',e.message);pc.release();await pool.end();await c.end();throw e;} pc.release();
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = 'http://127.0.0.1:' + server.address().port, suffix = randomBytes(4).toString('hex');
    let calls = 0; const tokens = {}, archivos = {};
    async function http(method, path, token, body, status = 200) {
        try { await guard(); } catch(e) { console.log('GUARD',e.message); await c.end(); throw e; } calls++;
        const r = await fetch(base + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
        const result = await r.json(); assert.equal(r.status, status, method + ' ' + path + ': ' + r.status + ' ' + (result.error ?? '')); return result;
    }
    async function tx(actor, fn) {
        await c.query('BEGIN'); try {
            await c.query("SELECT pg_advisory_xact_lock(hashtext('administracion-institucional'))");
            await c.query("SELECT set_config('app.usuario_actor_id',$1,true),set_config('app.motivo_documental','Prueba QA primer ingreso',true)", [actor]);
            const r = await fn(c); await c.query('ROLLBACK'); return r;
        } catch (e) { await c.query('ROLLBACK'); throw e; }
    }
    const presentacion = { presentante: 'Presentante QA', procedencia: 'Oficina de origen QA', proposito: 'Primera gestión ordinaria QA ' + suffix };
    const ordinary = async () => (await http('POST', '/api/documentos', tokens.usuario,
        { tipo_documental_id: f.tipo, asunto: 'Original QA ' + suffix, remitente: null, observaciones: null, archivador_id: f.archivador ?? null, archivo_id: archivos.usuario.id }, 201)).documento;
    const deliver = async d => (await http('POST', '/api/movimientos', tokens.usuario,
        { documento_id: d.id, usuario_destino_id: f.secretaria.id, motivo: 'Entrega física real QA' }, 201)).movimiento;
    const receiveBody = { ...presentacion, archivador_id: null, confirmar_recepcion: true };
    const nuevo = async()=>http('POST','/api/ingresos/externos',tokens.secretaria,{
      solicitud_id:randomUUID(),tipo_documental_id:f.tipo,asunto:'Ciclo ordinario QA '+suffix,remitente:'Externo QA',observaciones:null,
      archivador_id:null,archivo_id:archivos.secretaria.id,presentacion},201);
    const path=(d,i,op)=>`/api/ingresos/documentos/${d}/ingresos/${i}/${op}`;
    const act=(x,op,body,token=tokens.secretaria,status=201)=>http('POST',path(x.documento_id,x.ingreso.id,op),token,body,status);
    const ev=x=>act(x,'evidencias',{descripcion:'Gestión atendida '+suffix,confirmar_tenencia:true});
    const close=(x,e,status=200)=>act(x,'conclusion',{motivo:'Gestión completada QA',evidencia_id:e,confirmar:true},tokens.secretaria,status);
    const invalid=(x,status=200)=>act(x,'invalidacion',{motivo:'Incorporación equivocada QA',confirmar:true},tokens.secretaria,status);
    const rebody=x=>({...presentacion,ingreso_anterior_id:x.ingreso.id,confirmar_presentacion:true});
    let x, e;
    try {
        for (const key of ['admin','usuario','otro','director','secretaria']) tokens[key]=(await http('POST','/api/auth/login',null,{identificador:f[key].nombre_usuario,contrasena:f.password})).token;
        for (const key of ['usuario','secretaria']) archivos[key]=(await http('GET','/api/documentos/archivos-disponibles',tokens[key])).archivos[0];
        await t.test('Continuación append-only sin duplicar identidad ni modificar custodia',async()=>{
          x=await nuevo();
          const before=(await c.query('SELECT to_jsonb(d) d FROM documentos d WHERE id=$1',[x.documento_id])).rows;
          await act(x,'continuaciones',{descripcion:'Se adjunta continuación de la misma gestión'});
          assert.deepEqual((await c.query('SELECT to_jsonb(d) d FROM documentos d WHERE id=$1',[x.documento_id])).rows,before);
          const h=await http('GET',`/api/ingresos/documentos/${x.documento_id}/historia`,tokens.secretaria);assert.equal(h.total,1);assert.equal(h.ingreso.id,x.ingreso.id);
          const compatible=await http('GET',`/api/ingresos/documentos/${x.documento_id}?limite=1`,tokens.secretaria);assert.equal(compatible.ingreso.id,x.ingreso.id);assert.equal(compatible.ingresos.length,1);assert.equal(compatible.total,1);
          await act(x,'continuaciones',{descripcion:' '},tokens.secretaria,400);
        });
        await t.test('Permisos antes de listas, totales y actuaciones; SíseVe excluido',async()=>{
          for(const key of ['admin','otro','usuario']) await http('GET',`/api/ingresos/documentos/${x.documento_id}/historia`,tokens[key],null,key==='admin'?403:404);
          await http('GET',`/api/ingresos/documentos/${x.documento_id}/historia`,tokens.director);
          await act(x,'continuaciones',{descripcion:'Sin escritura'},tokens.director,403);
          await act(x,'evidencias',{descripcion:'Sin custodia',confirmar_tenencia:true},tokens.director,403);
          await http('GET',`/api/ingresos/documentos/${f.protegidoDocumento}/historia`,tokens.director,null,404);
          await http('GET',`/api/ingresos/documentos/${x.documento_id}/historia?limite=100`,tokens.secretaria,null,400);
        });
        await t.test('Evidencia obsoleta por corrección documental rechaza conclusión',async()=>{
          e=(await ev(x)).actuacion.id;
          await http('PUT','/api/documentos/'+x.documento_id,tokens.secretaria,{asunto:'Corrección QA '+suffix,remitente:'Externo QA',observaciones:null,motivo:'Corrección posterior a evidencia'});
          await close(x,e,409); e=(await ev(x)).actuacion.id;
        });
        await t.test('Dos conclusiones simultáneas: exactamente un desenlace y documento intacto',async()=>{
          const before=(await c.query('SELECT to_jsonb(d) d FROM documentos d WHERE id=$1',[x.documento_id])).rows;
          const r=await Promise.all([1,2].map(()=>fetch(base+path(x.documento_id,x.ingreso.id,'conclusion'),{method:'POST',headers:{Authorization:'Bearer '+tokens.secretaria,'Content-Type':'application/json'},body:JSON.stringify({motivo:'Cierre concurrente QA',evidencia_id:e,confirmar:true})}).then(async r=>{await r.json();return r.status;})));
          assert.deepEqual(r.sort(),[200,409]);
          assert.deepEqual((await c.query('SELECT to_jsonb(d) d FROM documentos d WHERE id=$1',[x.documento_id])).rows,before);
          await invalid(x,409);await act(x,'continuaciones',{descripcion:'Tardía'},tokens.secretaria,409);
        });
        await t.test('Reingreso con mismo ID/código, propósito nuevo, sin traslado ficticio',async()=>{
          const before=(await c.query('SELECT to_jsonb(d) d FROM documentos d WHERE id=$1',[x.documento_id])).rows;
          const r=await http('POST',`/api/ingresos/documentos/${x.documento_id}/reingresos`,tokens.secretaria,rebody(x),201);
          assert.equal(r.documento_id,x.documento_id);assert.notEqual(r.ingreso_id,x.ingreso.id);
          assert.deepEqual((await c.query('SELECT to_jsonb(d) d FROM documentos d WHERE id=$1',[x.documento_id])).rows,before);
          const h=await http('GET',`/api/ingresos/documentos/${x.documento_id}/historia?limite=1`,tokens.secretaria);assert.equal(h.total,2);assert.equal(h.ingresos.length,1);assert.equal(h.ingreso.ingreso_anterior_id,x.ingreso.id);
          assert.equal((await c.query('SELECT count(*)::int n FROM movimientos_documentales WHERE documento_id=$1',[x.documento_id])).rows[0].n,0);
          await http('POST',`/api/ingresos/documentos/${x.documento_id}/reingresos`,tokens.secretaria,rebody(x),409);
        });
        await t.test('Conclusión e invalidación concurrentes, sin desenlaces contradictorios',async()=>{
          const y=await nuevo(),e=(await ev(y)).actuacion.id;
          const r=await Promise.all(['conclusion','invalidacion'].map(op=>fetch(base+path(y.documento_id,y.ingreso.id,op),{method:'POST',headers:{Authorization:'Bearer '+tokens.secretaria,'Content-Type':'application/json'},body:JSON.stringify({motivo:'Desenlace concurrente QA',confirmar:true,...(op==='conclusion'?{evidencia_id:e}:{})})}).then(async r=>{await r.json();return r.status;})));
          assert.deepEqual(r.sort(),[200,409]);
        });
        await t.test('Continuación concurrente con cierre: orden serial, sin hechos tardíos',async()=>{
          const y=await nuevo(),e=(await ev(y)).actuacion.id;
          const bodies=[['conclusion',{motivo:'Cierre QA',confirmar:true,evidencia_id:e}],['continuaciones',{descripcion:'Actuación concurrente QA'}]];
          const r=await Promise.all(bodies.map(([op,body])=>fetch(base+path(y.documento_id,y.ingreso.id,op),{method:'POST',headers:{Authorization:'Bearer '+tokens.secretaria,'Content-Type':'application/json'},body:JSON.stringify(body)}).then(async r=>{await r.json();return r.status;})));
          assert.equal(r[0],200);assert.ok([201,409].includes(r[1]));
        });
        await t.test('Autorización y traslado impiden concluir e invalidar; movimiento conserva contexto',async()=>{
          const y=await nuevo(),e=(await ev(y)).actuacion.id;
          await http('POST','/api/documentos/'+y.documento_id+'/autorizar',tokens.director,{usuario_destino_id:f.usuario.id,motivo:'Autorización QA'});
          await close(y,e,409);await invalid(y,409);
          const m=(await http('POST','/api/movimientos',tokens.secretaria,{documento_id:y.documento_id,usuario_destino_id:f.usuario.id,motivo:'Salida QA'},201)).movimiento;
          assert.equal(m.ingreso_referencia,y.ingreso.referencia);await close(y,e,409);await invalid(y,409);
          await http('POST','/api/movimientos/'+m.id+'/recibir',tokens.usuario,{archivador_id:f.archivador??null});
          await close(y,e,409);
          const e2=(await act(y,'evidencias',{descripcion:'Resultado por custodio actual',confirmar_tenencia:true},tokens.usuario)).actuacion.id;
          await act(y,'continuaciones',{descripcion:'Seguimiento de Secretaría'});
          await close(y,e2);
          assert.equal((await http('GET','/api/movimientos/'+m.id,tokens.usuario)).movimiento.ingreso_referencia,y.ingreso.referencia);
          await act(y,'continuaciones',{descripcion:'Tardía'},tokens.usuario,409);
        });
        await t.test('Invalidación conserva documento, hechos físicos y auditoría; reingreso exige nueva presentación',async()=>{
          const d=await ordinary(),m=await deliver(d);
          const z=await http('POST','/api/ingresos/recepciones/'+m.id,tokens.secretaria,receiveBody,201);
          const before=(await c.query('SELECT to_jsonb(d) d,to_jsonb(m) m FROM documentos d JOIN movimientos_documentales m ON m.documento_id=d.id WHERE m.id=$1',[m.id])).rows;
          await invalid(z);
          assert.deepEqual((await c.query('SELECT to_jsonb(d) d,to_jsonb(m) m FROM documentos d JOIN movimientos_documentales m ON m.documento_id=d.id WHERE m.id=$1',[m.id])).rows,before);
          await invalid(z,409);
          await http('POST',`/api/ingresos/documentos/${z.documento_id}/reingresos`,tokens.secretaria,{...rebody(z),movimiento_recepcion_id:m.id},409);
          await http('POST',`/api/ingresos/documentos/${z.documento_id}/reingresos`,tokens.secretaria,rebody(z),201);
          await tx(f.secretaria.id,async q=>{
            assert.ok((await q.query("SELECT 1 FROM auditoria_archivistica WHERE tabla='ingresos_mesa_partes' AND registro_id=$1 AND accion='MODIFICAR'",[z.ingreso.id])).rowCount);
            await assert.rejects(q.query("UPDATE ingresos_actuaciones SET descripcion='Reescritura'"),{code:'42501'});
          });
        });
        await t.test('Rechazo pendiente de recuperación impide desenlace y conserva la evidencia histórica',async()=>{
          const y=await nuevo(),e=(await ev(y)).actuacion.id;
          await http('POST','/api/documentos/'+y.documento_id+'/autorizar',tokens.director,{usuario_destino_id:f.usuario.id,motivo:'Decisión QA'});
          const m=(await http('POST','/api/movimientos',tokens.secretaria,{documento_id:y.documento_id,usuario_destino_id:f.usuario.id,motivo:'Traslado QA'},201)).movimiento;
          await http('POST','/api/movimientos/'+m.id+'/rechazar',tokens.usuario,{motivo:'Entrega rechazada QA'});
          await close(y,e,409);await invalid(y,409);
          await http('POST','/api/movimientos/'+m.id+'/recuperar',tokens.secretaria,{archivador_id:null,motivo:'Recuperación física QA',confirmar_recuperacion:true});
          await close(y,e,409);
          const actual=(await ev(y)).actuacion.id;await close(y,actual);
        });
        await t.test('Participación histórica sin custodia no escribe; Secretaría conserva archivo al salir',async()=>{
          const d=await ordinary(),m=await deliver(d);
          const y=await http('POST','/api/ingresos/recepciones/'+m.id,tokens.secretaria,receiveBody,201);
          await http('POST','/api/documentos/'+y.documento_id+'/autorizar',tokens.director,{usuario_destino_id:f.otro.id,motivo:'Decisión QA'});
          const salida=(await http('POST','/api/movimientos',tokens.secretaria,{documento_id:y.documento_id,usuario_destino_id:f.otro.id,motivo:'Salida QA'},201)).movimiento;
          await http('POST','/api/movimientos/'+salida.id+'/recibir',tokens.otro,{archivador_id:null});
          await act(y,'continuaciones',{descripcion:'Autor histórico sin custodia'},tokens.usuario,403);
          const detalle=(await http('GET','/api/documentos/'+y.documento_id,tokens.secretaria)).documento;
          assert.equal(detalle.archivo_id,d.archivo_id);assert.ok(detalle.archivo_nombre);
          const e=(await act(y,'evidencias',{descripcion:'Resultado acreditado por el custodio',confirmar_tenencia:true},tokens.otro)).actuacion.id;
          await close(y,e);
          for(const key of ['admin','director','secretaria','usuario']) {
            const status=key==='admin'?403:200;
            const h=await http('GET',`/api/ingresos/documentos/${y.documento_id}/auditoria?limite=1`,tokens[key],null,status);
            if(status===200){assert.ok(h.total>=4);assert.equal(h.auditoria.length,1);assert.ok(!JSON.stringify(h).includes('Resultado acreditado'));}
          }
          await http('GET',`/api/ingresos/documentos/${f.protegidoDocumento}/auditoria`,tokens.director,null,404);
        });
        await t.test('Nueva entrega recibida acredita reingreso y conserva el contexto del traslado anterior',async()=>{
          const y=await nuevo();
          await http('POST','/api/documentos/'+y.documento_id+'/autorizar',tokens.director,{usuario_destino_id:f.usuario.id,motivo:'Decisión QA'});
          const salida=(await http('POST','/api/movimientos',tokens.secretaria,{documento_id:y.documento_id,usuario_destino_id:f.usuario.id,motivo:'Salida de primera gestión'},201)).movimiento;
          await http('POST','/api/movimientos/'+salida.id+'/recibir',tokens.usuario,{archivador_id:f.archivador??null});
          const evidencia=(await act(y,'evidencias',{descripcion:'Gestión atendida en oficina',confirmar_tenencia:true},tokens.usuario)).actuacion.id;
          await close(y,evidencia);
          const entrega=(await http('POST','/api/movimientos',tokens.usuario,{documento_id:y.documento_id,usuario_destino_id:f.secretaria.id,motivo:'Nueva presentación posterior'},201)).movimiento;
          await http('POST','/api/movimientos/'+entrega.id+'/recibir',tokens.secretaria,{archivador_id:null});
          const before=(await c.query('SELECT to_jsonb(m) m FROM movimientos_documentales m WHERE id=ANY($1::bigint[]) ORDER BY id',[[salida.id,entrega.id]])).rows;
          const re=await http('POST',`/api/ingresos/documentos/${y.documento_id}/reingresos`,tokens.secretaria,rebody(y),201);
          const detalle=(await http('GET','/api/documentos/'+y.documento_id,tokens.secretaria)).documento;
          assert.equal(detalle.estado_tramite,'PENDIENTE_DECISION');assert.equal(detalle.id,y.documento_id);
          assert.equal(detalle.ingreso_mesa_partes.movimiento_recepcion_id,entrega.id);
          assert.equal((await http('GET','/api/movimientos/'+salida.id,tokens.usuario)).movimiento.ingreso_referencia,y.ingreso.referencia);
          assert.equal((await http('GET','/api/movimientos/'+entrega.id,tokens.usuario)).movimiento.ingreso_referencia,'MP-'+re.ingreso_id.padStart(6,'0'));
          assert.deepEqual((await c.query('SELECT to_jsonb(m) m FROM movimientos_documentales m WHERE id=ANY($1::bigint[]) ORDER BY id',[[salida.id,entrega.id]])).rows,before);
        });
        await t.test('Reingreso concurrente con nueva autorización/salida se serializa y nunca reasigna movimientos',async()=>{
          const y=await nuevo(),e=(await ev(y)).actuacion.id;await close(y,e);
          const paths=[`/api/ingresos/documentos/${y.documento_id}/reingresos`,`/api/documentos/${y.documento_id}/autorizar`];
          const bodies=[rebody(y),{usuario_destino_id:f.usuario.id,motivo:'Decisión concurrente QA'}];
          const r=await Promise.all(paths.map((path,k)=>fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+(k?tokens.director:tokens.secretaria),'Content-Type':'application/json'},body:JSON.stringify(bodies[k])}).then(async r=>({status:r.status,body:await r.json()}))));
          assert.equal(r[1].status,200);assert.ok([201,409].includes(r[0].status));
          const m=(await http('POST','/api/movimientos',tokens.secretaria,{documento_id:y.documento_id,usuario_destino_id:f.usuario.id,motivo:'Salida tras conflicto QA'},201)).movimiento;
          const esperado=r[0].status===201?'MP-'+r[0].body.ingreso_id.padStart(6,'0'):null;
          assert.equal(m.ingreso_referencia,esperado);
          await http('POST',`/api/ingresos/documentos/${y.documento_id}/reingresos`,tokens.secretaria,rebody(y),409);
          assert.equal((await http('GET','/api/movimientos/'+m.id,tokens.secretaria)).movimiento.ingreso_referencia,esperado);
        });
        await t.test('Salida física y reingreso simultáneos con autorización vigente: no abren otro ingreso',async()=>{
          const y=await nuevo(),e=(await ev(y)).actuacion.id;await close(y,e);
          await http('POST','/api/documentos/'+y.documento_id+'/autorizar',tokens.director,{usuario_destino_id:f.usuario.id,motivo:'Decisión para salida QA'});
          const paths=[`/api/ingresos/documentos/${y.documento_id}/reingresos`,'/api/movimientos'];
          const bodies=[rebody(y),{documento_id:y.documento_id,usuario_destino_id:f.usuario.id,motivo:'Salida física concurrente QA'}];
          const results=await Promise.all(paths.map((path,k)=>fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+tokens.secretaria,'Content-Type':'application/json'},body:JSON.stringify(bodies[k])}).then(async r=>{await r.json();return r.status;})));
          assert.deepEqual(results,[409,201]);
          const h=await http('GET',`/api/ingresos/documentos/${y.documento_id}/historia`,tokens.secretaria);assert.equal(h.total,1);assert.equal(h.ingreso,null);
        });
        await t.test('La versión documental cambia antes de confirmar una conclusión bloqueada: evidencia rechazada',async()=>{
          const y=await nuevo(),e=(await ev(y)).actuacion.id;
          await c.query('BEGIN');
          await c.query("SELECT pg_advisory_xact_lock(hashtext('administracion-institucional'))");
          await c.query("SELECT set_config('app.usuario_actor_id',$1,true),set_config('app.motivo_documental','Corrección concurrente QA',true)",[f.secretaria.id]);
          await c.query("UPDATE documentos SET observaciones='Cambio concurrente antes de conclusión QA' WHERE id=$1",[y.documento_id]);
          const pendiente=close(y,e,409);
          await esperar(40);
          await c.query('COMMIT');await pendiente;
          const h=await http('GET',`/api/ingresos/documentos/${y.documento_id}/historia`,tokens.secretaria);assert.equal(h.ingreso.id,y.ingreso.id);
        });
        await t.test('SQL directo no falsifica evidencia ni reescribe actuaciones o desenlaces',async()=>{
          const y=await nuevo();
          await assert.rejects(tx(f.director.id,q=>q.query(`INSERT INTO ingresos_actuaciones(ingreso_id,registrado_por_id,fecha_actuacion,descripcion,tipo,version_documental,custodio_id,oficina_id)
           VALUES($1,$2,clock_timestamp(),'Falsa tenencia','EVIDENCIA_RESULTADO','0',$2,$3)`,[y.ingreso.id,f.director.id,f.director.oficina_id])),{code:'23514'});
          await assert.rejects(tx(f.secretaria.id,q=>q.query(`UPDATE ingresos_mesa_partes SET fecha_conclusion=clock_timestamp(),concluido_por_id=$2,motivo_conclusion='Sin evidencia',resultado='Falso' WHERE id=$1`,[y.ingreso.id,f.secretaria.id])),{code:'23514'});
          await assert.rejects(tx(f.secretaria.id,q=>q.query('DELETE FROM ingresos_actuaciones WHERE ingreso_id=$1',[y.ingreso.id])),{code:'42501'});
          await tx(f.secretaria.id,async q=>assert.equal((await q.query('SELECT fecha_conclusion,fecha_invalidacion FROM ingresos_mesa_partes WHERE id=$1',[y.ingreso.id])).rows[0].fecha_conclusion,null));
          for(const table of ['archivos_relevos','relevos_documentos','movimientos_sustituciones','sustituciones_actuaciones'])
           await assert.rejects(tx(f.secretaria.id,q=>q.query(`INSERT INTO ${table} DEFAULT VALUES`)),{code:continuidadInstalada?'23514':'42501'});
        });
        console.log(JSON.stringify({ciclo:'ordinario',httpRequests:calls,effectiveRole:rolEfectivo}));
    } finally {await new Promise(r=>server.close(r));await pool.end();await c.end();}
});
