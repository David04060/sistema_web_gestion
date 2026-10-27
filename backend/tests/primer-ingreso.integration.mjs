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
    CORS_ORIGINS: '', TRUST_PROXY_HOPS: '0', VINCULACION_ARCHIVOS_HABILITADA: 'true', PRIMER_INGRESO_ORDINARIO_HABILITADO: 'true' });

test('Primer ingreso ordinario: HTTP y PostgreSQL con rol restringido', async t => {
    const c = new pg.Client({ connectionString: url.toString() }); await c.connect();
    const continuidadInstalada=(await c.query("SELECT to_regprocedure('public.fn_ai_continuidad_operacion()') IS NOT NULL v")).rows[0].v;
    const cicloInstalado = (await c.query("SELECT to_regprocedure('public.fn_mp_ciclo()') IS NOT NULL v")).rows[0].v;
    async function guard(client = c) {
        const r = (await client.query(`SELECT current_database() db,current_user rol,inet_server_addr()::text host,inet_server_port() port,
          (SELECT oid::text FROM pg_database WHERE datname=current_database()) oid,
          (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) elevado`)).rows[0];
        assert.equal('/' + r.db, url.pathname); assert.equal(r.oid, process.env.ARCHIVOS_QA_OID);
        assert.equal(r.rol, rolEfectivo); assert.equal(r.elevado, false);
        assert.ok(['::1/128', '127.0.0.1/32'].includes(r.host)); assert.equal(r.port, Number(url.port || 5432));
    }
    await guard();
    const { app } = await import('../src/app.ts'); const { pool } = await import('../src/config/database.ts');
    const pc = await pool.connect(); await guard(pc); pc.release();
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = 'http://127.0.0.1:' + server.address().port, suffix = randomBytes(4).toString('hex');
    let calls = 0; const tokens = {}, archivos = {};
    async function http(method, path, token, body, status = 200) {
        await guard(); calls++;
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
    let doc, move, first, external;
    try {
        for (const key of ['admin', 'usuario', 'otro', 'director', 'secretaria']) tokens[key] = (await http('POST', '/api/auth/login', null,
            { identificador: f[key].nombre_usuario, contrasena: f.password })).token;
        for (const key of ['usuario', 'secretaria']) archivos[key] = (await http('GET', '/api/documentos/archivos-disponibles', tokens[key])).archivos[0];
        assert.ok(archivos.usuario && archivos.secretaria);
        await t.test('Bandeja dirigida permite vista mínima; no concede contenido global ni archivo ajeno', async () => {
            doc = await ordinary(); move = await deliver(doc);
            const preview = (await http('GET', '/api/ingresos/recepciones/' + move.id, tokens.secretaria)).entrega;
            assert.equal(preview.codigo, doc.codigo); assert.equal(preview.archivo_id, archivos.usuario.id);
            assert.ok(!('observaciones' in preview));
            await http('GET', '/api/documentos/' + doc.id, tokens.secretaria, null, 404);
            await http('GET', '/api/ingresos/recepciones/9223372036854775807', tokens.secretaria, null, 404);
            for (const key of ['admin', 'usuario', 'otro', 'director'])
                await http('GET', '/api/ingresos/recepciones/' + move.id, tokens[key], null, 403);
            await http('GET', '/api/ingresos/recepciones/' + move.id, null, null, 401);
        });
        await t.test('Recibir e ingresar confirma custodia, ingreso y PENDIENTE_DECISION sin duplicar original', async () => {
            await http('POST', '/api/ingresos/recepciones/' + move.id, tokens.secretaria, { ...receiveBody, confirmar_recepcion: false }, 400);
            first = (await http('POST', '/api/ingresos/recepciones/' + move.id, tokens.secretaria, receiveBody, 201)).ingreso;
            const d = (await http('GET', '/api/documentos/' + doc.id, tokens.secretaria)).documento;
            assert.equal(d.id, doc.id); assert.equal(d.codigo, doc.codigo); assert.equal(d.registrado_por_id, doc.registrado_por_id);
            assert.equal(d.archivo_id, doc.archivo_id); assert.equal(d.responsable_actual_id, f.secretaria.id);
            assert.equal(d.estado_tramite, 'PENDIENTE_DECISION'); assert.equal(d.ingreso_mesa_partes.referencia, first.referencia);
            assert.equal(first.movimiento_recepcion_id, move.id); assert.match(first.referencia, /^MP-\d+$/);
            assert.equal((await http('GET', '/api/ingresos/documentos/' + doc.id, tokens.usuario)).ingreso.id, first.id);
            assert.equal((await http('GET', '/api/movimientos/' + move.id, tokens.secretaria)).movimiento.puede_primer_ingreso, false);
            assert.equal((await c.query('SELECT count(*)::int n FROM documentos WHERE id=$1', [doc.id])).rows[0].n, 1);
            await http('POST', '/api/ingresos/recepciones/' + move.id, tokens.secretaria, receiveBody, 409);
        });
        await t.test('Fallo inyectado al insertar ingreso revierte recepción, custodia, estado e historiales', async () => {
            const d = await ordinary(), m = await deliver(d);
            const before = (await c.query(`SELECT to_jsonb(d) d,to_jsonb(m) m,
              (SELECT count(*) FROM historial_modificaciones WHERE (tabla='documentos' AND registro_id=d.id) OR (tabla='movimientos_documentales' AND registro_id=m.id)) h
              FROM documentos d JOIN movimientos_documentales m ON m.documento_id=d.id WHERE m.id=$1`, [m.id])).rows;
            await http('POST', '/api/ingresos/recepciones/' + m.id, tokens.secretaria, { ...receiveBody, proposito: f.fallo }, 400);
            assert.deepEqual((await c.query(`SELECT to_jsonb(d) d,to_jsonb(m) m,
              (SELECT count(*) FROM historial_modificaciones WHERE (tabla='documentos' AND registro_id=d.id) OR (tabla='movimientos_documentales' AND registro_id=m.id)) h
              FROM documentos d JOIN movimientos_documentales m ON m.documento_id=d.id WHERE m.id=$1`, [m.id])).rows, before);
            assert.equal((await http('GET', '/api/ingresos/recepciones/' + m.id, tokens.secretaria)).entrega.estado, 'EN_TRASLADO');
        });
        await t.test('Original externo confirma documento, archivo, presentación y auditoría sin traslado ficticio', async () => {
            const body = { solicitud_id: randomUUID(), tipo_documental_id: f.tipo, asunto: 'Externo QA ' + suffix, remitente: 'Remitente externo QA', observaciones: null,
                archivador_id: null, archivo_id: archivos.secretaria.id, presentacion: { ...presentacion, procedencia: 'Procedencia externa QA' } };
            await http('POST', '/api/ingresos/externos', tokens.secretaria, { ...body, archivo_id: archivos.usuario.id }, 403);
            const before = (await c.query('SELECT (SELECT count(*) FROM documentos) d,(SELECT count(*) FROM historial_modificaciones) h')).rows;
            const correl = (await c.query('SELECT * FROM correlativos_documentales ORDER BY tipo_documental_id,anio')).rows;
            await http('POST', '/api/ingresos/externos', tokens.secretaria, { ...body, presentacion: { ...presentacion, proposito: f.fallo } }, 400);
            assert.deepEqual((await c.query('SELECT (SELECT count(*) FROM documentos) d,(SELECT count(*) FROM historial_modificaciones) h')).rows, before);
            assert.deepEqual((await c.query('SELECT * FROM correlativos_documentales ORDER BY tipo_documental_id,anio')).rows, correl);
            external = await http('POST', '/api/ingresos/externos', tokens.secretaria, body, 201);
            await http('POST', '/api/ingresos/externos', tokens.secretaria, body, 409);
            const d = (await http('GET', '/api/documentos/' + external.documento_id, tokens.secretaria)).documento;
            assert.equal(d.registrado_por_id, f.secretaria.id); assert.equal(d.remitente, body.remitente);
            assert.equal(d.archivo_id, archivos.secretaria.id); assert.equal(d.estado_tramite, 'PENDIENTE_DECISION');
            assert.equal(external.ingreso.movimiento_recepcion_id, null);
            assert.equal((await c.query('SELECT count(*)::int n FROM movimientos_documentales WHERE documento_id=$1', [d.id])).rows[0].n, 0);
            await tx(f.secretaria.id, async q => assert.equal((await q.query("SELECT count(*)::int n FROM auditoria_archivistica WHERE tabla='ingresos_mesa_partes' AND registro_id=$1", [external.ingreso.id])).rows[0].n, 1));
        });
        await t.test('Dos confirmaciones concurrentes producen un solo ingreso y una sola recepción', async () => {
            const d = await ordinary(), m = await deliver(d);
            const results = await Promise.all([1, 2].map(async () => {
                const r = await fetch(base + '/api/ingresos/recepciones/' + m.id, { method: 'POST', headers: { Authorization: 'Bearer ' + tokens.secretaria, 'Content-Type': 'application/json' }, body: JSON.stringify(receiveBody) });
                await r.json(); return r.status;
            })); calls += 2; assert.deepEqual(results.sort(), [201, 409]);
            await tx(f.secretaria.id, async q => assert.equal((await q.query('SELECT count(*)::int n FROM ingresos_mesa_partes WHERE documento_id=$1', [d.id])).rows[0].n, 1));
        });
        await t.test('Alta externa concurrente con la misma clave confirma un solo documento e ingreso', async () => {
            const body = { solicitud_id: randomUUID(), tipo_documental_id: f.tipo, asunto: 'Externo concurrente QA ' + suffix,
                remitente: 'Remitente QA', observaciones: null, archivador_id: null, archivo_id: archivos.secretaria.id, presentacion };
            const before = (await c.query('SELECT count(*)::int n FROM documentos')).rows[0].n;
            const results = await Promise.all([1, 2].map(async () => {
                const r = await fetch(base + '/api/ingresos/externos', { method: 'POST', headers: { Authorization: 'Bearer ' + tokens.secretaria, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                await r.json(); return r.status;
            })); calls += 2; assert.deepEqual(results.sort(), [201, 409]);
            assert.equal((await c.query('SELECT count(*)::int n FROM documentos')).rows[0].n, before + 1);
            await tx(f.secretaria.id, async q => assert.equal((await q.query('SELECT count(*)::int n FROM ingresos_mesa_partes WHERE solicitud_id=$1', [body.solicitud_id])).rows[0].n, 1));
        });
        await t.test('Consulta y decisión de Dirección: autorización conserva estado y salida nueva conserva contexto', async () => {
            const d = (await http('GET', '/api/documentos/' + doc.id, tokens.director)).documento;
            assert.equal(d.ingreso_mesa_partes.proposito, presentacion.proposito);
            const authorized = (await http('POST', '/api/documentos/' + doc.id + '/autorizar', tokens.director, { usuario_destino_id: f.usuario.id, motivo: 'Decisión institucional QA' })).documento;
            assert.equal(authorized.estado_tramite, 'PENDIENTE_DECISION');
            assert.equal((await c.query('SELECT count(*)::int n FROM movimientos_documentales WHERE documento_id=$1', [doc.id])).rows[0].n, 1);
            const outgoing = (await http('POST', '/api/movimientos', tokens.secretaria, { documento_id: doc.id, usuario_destino_id: f.usuario.id, motivo: 'Salida autorizada QA' }, 201)).movimiento;
            assert.equal(outgoing.estado, 'EN_TRASLADO'); assert.equal(outgoing.ingreso_referencia, first.referencia);
            assert.equal((await http('GET', '/api/movimientos/' + move.id, tokens.usuario)).movimiento.ingreso_referencia, null);
            await http('POST', '/api/movimientos/' + outgoing.id + '/recibir', tokens.usuario, { archivador_id: f.archivador ?? null });
            const returned = (await http('GET', '/api/documentos/' + doc.id, tokens.usuario)).documento;
            assert.equal(returned.archivo_id, archivos.usuario.id); assert.equal(returned.estado_tramite, 'RECIBIDO');
            assert.equal((await http('GET', '/api/ingresos/documentos/' + doc.id, tokens.usuario)).ingreso.id, first.id);
            for (const key of ['admin', 'otro']) await http('GET', '/api/ingresos/documentos/' + doc.id, tokens[key], null, key === 'admin' ? 403 : 404);
        });
        await t.test('Recepción ordinaria no abre ingreso; formalización posterior exige evidencia vigente', async () => {
            const d = await ordinary(), m = await deliver(d);
            await http('POST', '/api/ingresos/recibidos/' + m.id, tokens.secretaria, presentacion, 409);
            await http('POST', '/api/movimientos/' + m.id + '/recibir', tokens.secretaria, { archivador_id: null });
            assert.equal((await http('GET', '/api/ingresos/documentos/' + d.id, tokens.secretaria)).ingreso, null);
            assert.equal((await http('GET', '/api/movimientos/' + m.id, tokens.secretaria)).movimiento.puede_primer_ingreso, true);
            await assert.rejects(tx(f.secretaria.id, async q => {
                await q.query("SELECT set_config('app.primer_ingreso_operacion','FORMALIZAR',true)");
                await q.query(`WITH instante AS(SELECT clock_timestamp() t) INSERT INTO ingresos_mesa_partes
                 (documento_id,registrado_por_id,fecha_ingreso,fecha_presentacion,presentante,procedencia,proposito,movimiento_recepcion_id)
                 SELECT $1,$2,t,t,'QA','QA','Intento sin solicitar decisión',$3 FROM instante`, [d.id, f.secretaria.id, m.id]);
                await q.query('SET CONSTRAINTS ct_mp_ingreso_final IMMEDIATE');
            }), { code: '23514' });
            assert.equal((await http('GET', '/api/ingresos/documentos/' + d.id, tokens.secretaria)).ingreso, null);
            const before = (await c.query('SELECT to_jsonb(m) m FROM movimientos_documentales m WHERE id=$1', [m.id])).rows;
            await http('POST', '/api/documentos/' + d.id + '/solicitar-decision', tokens.secretaria, { motivo: 'Solicitud de decisión previa a la formalización QA' });
            await http('POST', '/api/ingresos/recibidos/' + m.id, tokens.secretaria, presentacion, 201);
            assert.deepEqual((await c.query('SELECT to_jsonb(m) m FROM movimientos_documentales m WHERE id=$1', [m.id])).rows, before);
            assert.equal((await http('GET', '/api/documentos/' + d.id, tokens.secretaria)).documento.estado_tramite, 'PENDIENTE_DECISION');
        });
        await t.test('Referencias incompatibles, SíseVe y operaciones posteriores permanecen rechazadas', async () => {
            await http('POST', '/api/ingresos/externos', tokens.secretaria,
                { solicitud_id: randomUUID(), tipo_documental_id: f.protegidoTipo, asunto: 'No admisible', remitente: 'QA', observaciones: null, archivador_id: null, archivo_id: archivos.secretaria.id, presentacion }, 400);
            await http('GET', '/api/ingresos/documentos/' + f.protegidoDocumento, tokens.director, null, 404);
            await assert.rejects(tx(f.secretaria.id, async q => {
                await q.query("SELECT set_config('app.tipo_restringido_id',$1,true),set_config('app.primer_ingreso_operacion','EXTERNO',true)", [f.protegidoTipo]);
                await q.query(`WITH instante AS(SELECT clock_timestamp() t) INSERT INTO ingresos_mesa_partes
                 (documento_id,registrado_por_id,fecha_ingreso,fecha_presentacion,presentante,procedencia,proposito,solicitud_id)
                 SELECT $1,$2,t,t,'QA','QA','Intento ordinario protegido',$3 FROM instante`, [f.protegidoDocumento, f.secretaria.id, randomUUID()]);
            }), { code: '23514' });
            for (const key of ['admin', 'usuario', 'director', 'otro']) await http('POST', '/api/ingresos/recepciones/' + move.id, tokens[key], receiveBody, 403);
            await http('POST', '/api/ingresos/externos', tokens.secretaria, { documento_id: doc.id }, 400);
            await assert.rejects(tx(f.secretaria.id, async q => {
                await q.query("SELECT set_config('app.primer_ingreso_operacion','SALIDA',true)");
                await q.query(`INSERT INTO movimientos_ingresos(movimiento_id,ingreso_id,documento_id,vinculado_por_id,fecha_vinculacion,motivo)
                 VALUES($1,$2,$3,$4,clock_timestamp(),'Referencia incompatible QA')`, [move.id, external.ingreso.id, external.documento_id, f.secretaria.id]);
            }), e => ['23503', '23514'].includes(e.code));
            await assert.rejects(tx(f.secretaria.id, q => q.query("UPDATE ingresos_mesa_partes SET proposito='No permitido' WHERE id=$1", [first.id])), { code: '42501' });
            await http('GET', '/api/ingresos/documentos/' + doc.id + '/historia', tokens.secretaria, null, 409);
            assert.equal((await http('GET','/api/documentos/opciones',tokens.secretaria)).ciclo_ingresos_ordinarios_habilitado,false);
            for (const accion of ['concluir', 'invalidar', 'continuar', 'reingresar'])
                await http('POST', '/api/ingresos/' + first.id + '/' + accion, tokens.secretaria, {}, 404);
            for (const table of [...(cicloInstalado ? [] : ['ingresos_actuaciones']), ...(continuidadInstalada?[]:['archivos_relevos', 'relevos_documentos', 'movimientos_sustituciones', 'sustituciones_actuaciones'])])
                await assert.rejects(tx(f.secretaria.id, q => q.query(`INSERT INTO ${table} DEFAULT VALUES`)), { code: '42501' });
        });
        console.log(JSON.stringify({ stage: 'primer ingreso ordinario', httpRequests: calls, database: url.pathname.slice(1), effectiveRole: rolEfectivo }));
    } finally { await new Promise(resolve => server.close(resolve)); await pool.end(); await c.end(); }
});
