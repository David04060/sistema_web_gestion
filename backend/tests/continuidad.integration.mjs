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
    CORS_ORIGINS: '', TRUST_PROXY_HOPS: '0', VINCULACION_ARCHIVOS_HABILITADA: 'true', PRIMER_INGRESO_ORDINARIO_HABILITADO: 'true', CICLO_INGRESOS_ORDINARIOS_HABILITADO:'true',RELEVOS_HABILITADOS:'true',SUSTITUCIONES_HABILITADAS:'true',CORRECCIONES_VERSIONADAS_HABILITADAS:'true' });

test('Integración de continuidad: HTTP y PostgreSQL con rol restringido', async t => {
    const c = new pg.Client({ connectionString: url.toString() }); await c.connect();
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
    const deliver = async d => (await http('POST', '/api/movimientos', tokens.usuario,
        { documento_id: d.id, usuario_destino_id: f.secretaria.id, motivo: 'Entrega física real QA' }, 201)).movimiento;
    const receiveBody = { ...presentacion, archivador_id: null, confirmar_recepcion: true };
    const crearArchivo=async()=> (await http('POST','/api/archivos',tokens.admin,{nombre:'Archivo relevo QA '+randomUUID(),responsabilidad:'Responsabilidad QA',motivo:'Asignación inicial QA',oficina_id:f.oficina,responsable_id:f.usuario.id},201)).archivo;
    const nuevo=async(archivo=archivos.usuario.id)=>(await http('POST','/api/documentos',tokens.usuario,{tipo_documental_id:f.tipo,asunto:'Original continuidad QA '+suffix,remitente:null,observaciones:null,archivador_id:f.archivador??null,archivo_id:archivo},201)).documento;
    const sustitucion=async(d,intervencion,sustituto)=>{const m=await deliver(d);const s=(await http('POST','/api/continuidad/sustituciones',tokens.director,{movimiento_id:m.id,intervencion,sustituto_id:sustituto,motivo:'Autorización institucional expresa QA',confirmar_autorizacion:true},201)).sustitucion;return {m,s};};
    try {
      for(const key of ['admin','usuario','otro','director','secretaria'])tokens[key]=(await http('POST','/api/auth/login',null,{identificador:f[key].nombre_usuario,contrasena:f.password})).token;
      for(const key of ['usuario','secretaria'])archivos[key]=(await http('GET','/api/documentos/archivos-disponibles',tokens[key])).archivos[0];
      await t.test('Relevo separa responsabilidad, aceptación y entrega física; conserva ubicación e identidad',async()=>{
        const archivo=await crearArchivo(),d=await nuevo(archivo.id);
        const r=(await http('POST','/api/continuidad/relevos',tokens.admin,{archivo_id:archivo.id,asignacion_saliente_id:archivo.asignacion_id,responsable_entrante_id:f.otro.id,motivo:'Relevo institucional QA',confirmar:true},201)).relevo;
        const antes=(await http('GET','/api/documentos/'+d.id,tokens.usuario)).documento;assert.equal(antes.responsable_actual_id,f.usuario.id);assert.equal(antes.archivo_responsable_id,f.otro.id);
        await http('GET',`/api/continuidad/relevos/${r.id}/originales`,tokens.admin,null,403);
        await http('GET','/api/documentos/'+d.id,tokens.otro,null,404);
        assert.equal((await http('GET',`/api/continuidad/relevos/${r.id}/originales`,tokens.otro)).total,1);
        await http('POST',`/api/continuidad/relevos/${r.id}/aceptacion`,tokens.otro,{confirmar:true});
        assert.equal((await http('GET','/api/documentos/'+d.id,tokens.usuario)).documento.responsable_actual_id,f.usuario.id);
        await http('POST',`/api/continuidad/relevos/${r.id}/originales`,tokens.otro,{documento_id:d.id,motivo:'Original recibido físicamente QA',confirmar_tenencia:true,continuar_ubicacion:true,archivador_id:null},201);
        const despues=(await http('GET','/api/documentos/'+d.id,tokens.otro)).documento;
        for(const k of ['id','codigo','registrado_por_id','archivo_id','archivador_id','estado_tramite'])assert.equal(despues[k],d[k],k);
        assert.equal(despues.responsable_actual_id,f.otro.id);
        assert.ok((await http('GET','/api/documentos/opciones',tokens.otro)).archivadores.some(a=>a.id===d.archivador_id));
        await http('POST',`/api/continuidad/relevos/${r.id}/originales`,tokens.otro,{documento_id:d.id,motivo:'Duplicado QA',confirmar_tenencia:true,continuar_ubicacion:true,archivador_id:null},409);
      });
      await t.test('Relevo concurrente detecta asignación saliente obsoleta sin sobrescribir períodos',async()=>{
        const a=await crearArchivo(),body={archivo_id:a.id,asignacion_saliente_id:a.asignacion_id,responsable_entrante_id:f.otro.id,motivo:'Relevo concurrente QA',confirmar:true};
        const resultados=await Promise.all([1,2].map(()=>fetch(base+'/api/continuidad/relevos',{method:'POST',headers:{Authorization:'Bearer '+tokens.admin,'Content-Type':'application/json'},body:JSON.stringify(body)}).then(async r=>{await r.json();return r.status;})));assert.deepEqual(resultados.sort(),[201,409]);
      });
      await t.test('Recepción mediante sustitución conserva destinatario y registra al ejecutante real',async()=>{
        // Secretaría solo puede ser sustituida por otra cuenta de su misma oficina.
        const d=await nuevo(),m=(await http('POST','/api/movimientos',tokens.usuario,{documento_id:d.id,usuario_destino_id:f.otro.id,motivo:'Entrega QA'},201)).movimiento;
        const s=(await http('POST','/api/continuidad/sustituciones',tokens.director,{movimiento_id:m.id,intervencion:'DESTINO',sustituto_id:f.usuario.id,motivo:'Autorización expresa de recepción QA',confirmar_autorizacion:true},201)).sustitucion;
        assert.equal(s.estado_movimiento,'EN_TRASLADO');assert.equal(typeof s.recuperacion_pendiente,'boolean');
        assert.equal((await http('GET','/api/movimientos/'+m.id,tokens.usuario)).movimiento.estado,'EN_TRASLADO');
        await http('POST',`/api/continuidad/sustituciones/${s.id}/actuacion`,tokens.usuario,{operacion:'RECIBIR',motivo:'Recepción física por designado QA',confirmar_hecho:true,archivador_id:f.archivador??null});
        const mov=(await http('GET','/api/movimientos/'+m.id,tokens.usuario)).movimiento;
        assert.equal(mov.usuario_destino_id,f.otro.id);assert.equal(mov.recibido_por_id,f.usuario.id);assert.equal(mov.estado,'RECIBIDO');
        const lista=await http('GET','/api/continuidad/sustituciones',tokens.director);const completada=lista.sustituciones.find(x=>x.id===s.id);assert.equal(completada.estado_movimiento,'RECIBIDO');assert.ok(completada.fecha_fin);assert.equal(completada.ejecutante_real,(await http('GET','/api/documentos/'+d.id,tokens.usuario)).documento.responsable);
      });
      await t.test('Sustitución de origen recupera rechazo sin modificar oficina ni participante original',async()=>{
        const d=await nuevo(),{m,s}=await sustitucion(d,'ORIGEN',f.otro.id);
        await http('POST','/api/movimientos/'+m.id+'/rechazar',tokens.secretaria,{motivo:'Rechazo físico QA'});
        const pendiente=(await http('GET','/api/continuidad/sustituciones',tokens.otro)).sustituciones.find(x=>x.id===s.id);assert.equal(pendiente.estado_movimiento,'RECHAZADO');assert.equal(pendiente.recuperacion_pendiente,true);
        await http('POST',`/api/continuidad/sustituciones/${s.id}/actuacion`,tokens.otro,{operacion:'RECUPERAR',motivo:'Recuperación física QA',confirmar_hecho:true,archivador_id:null});
        const mov=(await http('GET','/api/movimientos/'+m.id,tokens.usuario)).movimiento;
        assert.equal(mov.usuario_origen_id,f.usuario.id);assert.equal(mov.devolucion_confirmada_por_id,f.otro.id);assert.equal(mov.estado,'RECHAZADO');
        const recuperada=(await http('GET','/api/continuidad/sustituciones',tokens.otro)).sustituciones.find(x=>x.id===s.id);assert.equal(recuperada.recuperacion_pendiente,false);assert.ok(recuperada.fecha_fin);
        assert.equal((await http('GET','/api/documentos/'+d.id,tokens.otro)).documento.responsable_actual_id,f.otro.id);
      });
      await t.test('Dos ejecutantes concurrentes confirman una sola actuación y cancelación explícita',async()=>{
        const d=await nuevo(),{m,s}=await sustitucion(d,'ORIGEN',f.otro.id),body={operacion:'CANCELAR',motivo:'Cancelación con recuperación física QA',confirmar_hecho:true,archivador_id:null};
        const resultados=await Promise.all([1,2].map(()=>fetch(base+`/api/continuidad/sustituciones/${s.id}/actuacion`,{method:'POST',headers:{Authorization:'Bearer '+tokens.otro,'Content-Type':'application/json'},body:JSON.stringify(body)}).then(async r=>{await r.json();return r.status;})));assert.deepEqual(resultados.sort(),[200,409]);
        const mov=(await http('GET','/api/movimientos/'+m.id,tokens.usuario)).movimiento;assert.equal(mov.cancelado_por_id,f.otro.id);assert.equal(mov.usuario_origen_id,f.usuario.id);
      });
      await t.test('Permisos de designación, oficina y SíseVe se revalidan sin heredar accesos',async()=>{
        const d=await nuevo(),m=await deliver(d),body={movimiento_id:m.id,intervencion:'ORIGEN',sustituto_id:f.otro.id,motivo:'Autorización QA',confirmar_autorizacion:true};
        for(const key of ['admin','usuario','secretaria','otro'])await http('POST','/api/continuidad/sustituciones',tokens[key],body,403);
        await http('POST','/api/continuidad/sustituciones',tokens.director,{...body,sustituto_id:f.secretaria.id},400);
        await http('POST','/api/continuidad/sustituciones',tokens.director,{...body,confirmar_autorizacion:false},400);
        await http('GET','/api/continuidad/sustituciones',tokens.admin,null,403);
      });
      await t.test('Correcciones simultáneas usan versión original y preservan la primera escritura',async()=>{
        const d=await nuevo();const bodies=['A','B'].map(x=>({asunto:'Corrección '+x+' QA',remitente:null,observaciones:null,motivo:'Corrección concurrente QA',version_documental:d.version_documental}));
        const resultados=await Promise.all(bodies.map(body=>fetch(base+'/api/documentos/'+d.id,{method:'PUT',headers:{Authorization:'Bearer '+tokens.usuario,'Content-Type':'application/json'},body:JSON.stringify(body)}).then(async r=>{await r.json();return r.status;})));assert.deepEqual(resultados.sort(),[200,409]);
        await http('PUT','/api/documentos/'+d.id,tokens.usuario,{asunto:'Sin versión',remitente:null,observaciones:null,motivo:'Intento QA'},409);
      });
      await t.test('Relevo no acepta circulación pendiente ni concede escritura por pertenencia',async()=>{
        const a=await crearArchivo(),d=await nuevo(a.id);
        const m=(await http('POST','/api/movimientos',tokens.usuario,{documento_id:d.id,usuario_destino_id:f.secretaria.id,motivo:'Salida QA pendiente'},201)).movimiento;
        const r=(await http('POST','/api/continuidad/relevos',tokens.admin,{archivo_id:a.id,asignacion_saliente_id:a.asignacion_id,responsable_entrante_id:f.otro.id,motivo:'Relevo con original en circulación QA',confirmar:true},201)).relevo;
        await http('POST',`/api/continuidad/relevos/${r.id}/aceptacion`,tokens.otro,{confirmar:true});
        const lista=await http('GET',`/api/continuidad/relevos/${r.id}/originales`,tokens.otro);assert.equal(lista.total,1);assert.equal(lista.originales[0].disponible,false);
        await http('POST',`/api/continuidad/relevos/${r.id}/originales`,tokens.otro,{documento_id:d.id,motivo:'Intento prematuro QA',confirmar_tenencia:true,continuar_ubicacion:true,archivador_id:null},409);
        await http('GET','/api/documentos/'+d.id,tokens.otro,null,404);
        assert.equal((await http('GET','/api/movimientos/'+m.id,tokens.usuario)).movimiento.estado,'EN_TRASLADO');
      });
      await t.test('SQL no confirma sustituciones sin hecho físico ni permite cambiar participantes',async()=>{
        const d=await nuevo(),{m,s}=await sustitucion(d,'ORIGEN',f.otro.id);
        await assert.rejects(tx(f.otro.id,async q=>{await q.query("SELECT set_config('app.sustitucion_id',$1,true)",[s.id]);await q.query(`INSERT INTO sustituciones_actuaciones(sustitucion_id,actuado_por_id,operacion,fecha_actuacion,motivo) VALUES($1,$2,'CANCELAR',clock_timestamp(),'Hecho aislado QA')`,[s.id,f.otro.id]);await q.query('SET CONSTRAINTS ct_ai_sustitucion_actuada IMMEDIATE');}),{code:'23514'});
        await assert.rejects(tx(f.usuario.id,q=>q.query('UPDATE movimientos_documentales SET usuario_destino_id=$2 WHERE id=$1',[m.id,f.otro.id])),{code:'23514'});
        assert.equal((await http('GET','/api/movimientos/'+m.id,tokens.usuario)).movimiento.estado,'EN_TRASLADO');
      });
      await t.test('Dirección consulta SíseVe con autorización y clave sin ampliar escritura; relevo no hereda permisos',async()=>{
        const clave='QA-Restriccion-'+suffix;
        await http('PUT','/api/siseve/clave',tokens.admin,{contrasena:clave});
        for(const key of ['usuario','director'])await http('PUT','/api/siseve/autorizaciones',tokens.admin,{usuario_id:f[key].id,activo:true});
        const op=(key,operacion,id,datos={},status=200,k=clave)=>http('POST','/api/siseve/operaciones',tokens[key],{clave:k,operacion,...(id?{id}:{}),datos},status);
        const creado=(await op('usuario','registrar',null,{tipo_documental_id:f.protegidoTipo,asunto:'Caso exclusivo QA integración',remitente:null,observaciones:null,archivador_id:f.archivador??null})).resultado.documento;
        const lectura=(await op('director','detalle',creado.id)).resultado.documento;assert.equal(lectura.id,creado.id);assert.equal(lectura.permisos.editar,false);assert.equal(lectura.permisos.anular,false);assert.equal(lectura.permisos.salir,false);
        await op('director','detalle',creado.id,{},403,'Clave incorrecta QA');
        await op('director','corregir',creado.id,{asunto:'No permitido',remitente:null,observaciones:null,motivo:'Intento de escritura institucional QA',version_documental:creado.version_documental},403);
        await op('admin','detalle',creado.id,{},403);await op('otro','detalle',creado.id,{},403);
        const acceso=await http('GET','/api/siseve/acceso',tokens.otro);assert.equal(acceso.autorizado,false);assert.equal(acceso.clave_configurada,true);
        await http('GET','/api/documentos/'+creado.id,tokens.director,null,404);
        await http('GET','/api/documentos/'+creado.id+'/recorrido',tokens.director,null,404);
        await http('PUT','/api/siseve/autorizaciones',tokens.admin,{usuario_id:f.director.id,activo:false});await op('director','detalle',creado.id,{},403);
      });
      await t.test('Recorrido vertical distingue registro, decisiones, ingresos y hechos físicos con nombres',async()=>{
        const d=await nuevo(),m=await deliver(d);const ingreso=await http('POST','/api/ingresos/recepciones/'+m.id,tokens.secretaria,receiveBody,201);
        await http('POST','/api/documentos/'+d.id+'/autorizar',tokens.director,{usuario_destino_id:f.otro.id,motivo:'Decisión institucional QA'});
        const recorrido=await http('GET','/api/documentos/'+d.id+'/recorrido?limite=50',tokens.director);
        for(const tipo of ['REGISTRO','SALIDA','RECEPCION','INGRESO','DECISION'])assert.ok(recorrido.hechos.some(h=>h.tipo===tipo),tipo);
        assert.ok(recorrido.hechos.every(h=>h.responsable&&!/^[0-9]+$/.test(h.responsable)));
        await http('GET','/api/documentos/'+d.id+'/recorrido',tokens.admin,null,403);
        const historia=await http('GET','/api/documentos/'+ingreso.documento_id+'/historial',tokens.usuario);assert.ok(historia.historial.some(h=>h.campos_legibles));
      });
      console.log(JSON.stringify({continuidad:true,httpRequests:calls,rolEfectivo}));
    }finally{await new Promise(r=>server.close(r));await pool.end();await c.end();}
});
