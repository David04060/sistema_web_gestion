import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { URL } from 'node:url';

// Ejecución explícita. No carga .env, no migra ni prepara privilegios/fixtures.
assert.equal(process.env.ARCHIVOS_QA_AUTORIZADA, 'SOLO_COPIA_LOCAL');
const rolEfectivo = process.env.ARCHIVOS_QA_ROL_EFECTIVO ?? 'sistema_documental_app';
assert.ok(['sistema_documental_app','sistema_web_app'].includes(rolEfectivo));
const url = new URL(process.env.DATABASE_URL);
assert.match(url.pathname, /^\/sistema_web_final_qa_archivo_[a-f0-9]{32}$/);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
const fixtures = JSON.parse(process.env.ARCHIVOS_QA_FIXTURES);
Object.assign(process.env, { DB_PROFILE: 'local', RENDER: 'false', NODE_ENV: 'test',
    DOTENV_CONFIG_PATH: '.private/no-cargar-env-en-qa', JWT_SECRET: randomBytes(48).toString('hex'),
    CORS_ORIGINS: '', TRUST_PROXY_HOPS: '0', VINCULACION_ARCHIVOS_HABILITADA: 'true' });

test('Vinculación ordinaria con HTTP real y PostgreSQL restringido en QA', async t => {
    const c = new pg.Client({ connectionString: url.toString() });
    await c.connect();
    const continuidadInstalada=(await c.query("SELECT to_regprocedure('public.fn_ai_continuidad_operacion()') IS NOT NULL v")).rows[0].v;
    const cicloInstalado = (await c.query("SELECT to_regprocedure('public.fn_mp_ciclo()') IS NOT NULL v")).rows[0].v;
    async function guard() {
        const r = (await c.query(`SELECT current_database() db,current_user rol,inet_server_addr()::text host,
          inet_server_port() port,(SELECT oid::text FROM pg_database WHERE datname=current_database()) oid,
          (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) elevado`)).rows[0];
        assert.equal('/' + r.db, url.pathname);
        assert.equal(r.oid, process.env.ARCHIVOS_QA_OID);
        assert.equal(r.rol, rolEfectivo); assert.equal(r.elevado, false);
        assert.ok(['::1/128', '127.0.0.1/32'].includes(r.host));
        assert.equal(r.port, Number(url.port || 5432));
    }
    await guard();
    const primerIngresoInstalado = (await c.query("SELECT to_regprocedure('public.fn_mp_validar_primera_presentacion()') IS NOT NULL habilitada")).rows[0].habilitada;
    const { app } = await import('../src/app.ts');
    const { pool } = await import('../src/config/database.ts');
    const runtime = await pool.connect();
    assert.equal((await runtime.query('SELECT current_user rol')).rows[0].rol, rolEfectivo);
    runtime.release();
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = 'http://127.0.0.1:' + server.address().port;
    const suffix = randomBytes(5).toString('hex');
    let calls = 0;
    async function http(method, path, token, body, status = 200) {
        await guard(); calls++;
        const r = await fetch(base + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
        const result = await r.json();
        assert.equal(r.status, status, method + ' ' + path + ': ' + r.status + ' ' + (result.error ?? ''));
        return result;
    }
    async function tx(actor, action, fn, commit = true) {
        await guard(); await c.query('BEGIN');
        try {
            await c.query("SELECT pg_advisory_xact_lock(hashtext('administracion-institucional'))");
            await c.query("SELECT set_config('app.usuario_actor_id',$1,true),set_config('app.motivo_documental','Prueba QA de vinculación',true),set_config('app.pertenencia_operacion',$2,true)", [actor, action]);
            const result = await fn(c);
            await c.query(commit ? 'COMMIT' : 'ROLLBACK'); return result;
        } catch (e) { await c.query('ROLLBACK'); throw e; }
    }
    const token = {}, files = {};
    const content = { tipo_documental_id: fixtures.tipo, asunto: 'QA vínculo ' + suffix, remitente: null, observaciones: null, archivador_id: fixtures.archivador ?? null };
    let own, legacy;
    const old = async () => tx(fixtures.usuario.id, 'VINCULAR', async q => (await q.query(`INSERT INTO documentos
        (tipo_documental_id,asunto,remitente,observaciones,archivador_id,registrado_por_id,responsable_actual_id,oficina_responsable_id,estado_tramite)
        VALUES($1,$2,NULL,NULL,$5,$3,$3,$4,'RECIBIDO') RETURNING id::text`,
    [fixtures.tipo, 'QA antiguo ' + suffix, fixtures.usuario.id, fixtures.oficina, fixtures.archivador ?? null])).rows[0].id);
    try {
        for (const key of ['admin', 'usuario', 'otro', 'director', 'secretaria']) token[key] = (await http('POST', '/api/auth/login', null,
            { identificador: fixtures[key].nombre_usuario, contrasena: fixtures.password })).token;
        await t.test('Administrador crea archivos y los operativos solo seleccionan los propios', async () => {
            for (const key of ['usuario', 'otro', 'director', 'secretaria']) files[key] = (await http('POST', '/api/archivos', token.admin,
                { nombre: 'Vinculación ' + key + ' ' + suffix, responsabilidad: 'Archivo estable QA', oficina_id: fixtures[key].oficina_id ?? fixtures.oficina,
                    responsable_id: fixtures[key].id, motivo: 'Asignación inicial QA' }, 201)).archivo;
            const available = (await http('GET', '/api/documentos/archivos-disponibles', token.usuario)).archivos;
            assert.ok(available.some(a => a.id === files.usuario.id));
            assert.ok(!available.some(a => a.id === files.otro.id));
            await http('GET', '/api/documentos/archivos-disponibles', token.admin, null, 403);
            await http('GET', '/api/archivos', token.usuario, null, 403);
            await http('GET', '/api/documentos/archivos-disponibles', null, null, 401);
        });
        await t.test('Omisión, archivo ajeno, asignación futura e inexistente son rechazados', async () => {
            await http('POST', '/api/documentos', token.usuario, content, 400);
            for (const archivo_id of [files.otro.id, fixtures.futuro, '9223372036854775807'])
                await http('POST', '/api/documentos', token.usuario, { ...content, archivo_id }, 403);
            await http('POST', '/api/documentos', token.director, { ...content, archivo_id: files.usuario.id }, 403);
            await http('POST', '/api/documentos', token.admin, { ...content, archivo_id: files.usuario.id }, 403);
        });
        await t.test('Registro atómico preserva código, autoría, oficina inicial y custodia; sin movimiento ni ingreso', async () => {
            own = (await http('POST', '/api/documentos', token.usuario, { ...content, archivo_id: files.usuario.id }, 201)).documento;
            assert.equal(own.estado_tramite, 'RECIBIDO'); assert.equal(own.registrado_por_id, fixtures.usuario.id);
            assert.equal(own.responsable_actual_id, fixtures.usuario.id); assert.equal(own.archivo_id, files.usuario.id);
            assert.equal(own.archivador_id, fixtures.archivador ?? null);
            assert.equal(own.oficina_registro, fixtures.nombreOficina); assert.match(own.codigo, /^[A-Z]+\d{7,}$/);
            assert.equal((await c.query('SELECT count(*)::int n FROM movimientos_documentales WHERE documento_id=$1', [own.id])).rows[0].n, 0);
            await tx(fixtures.usuario.id, 'VINCULAR', async q => {
                const a = (await q.query("SELECT count(*)::int n FROM auditoria_archivistica h JOIN documentos_archivos da ON da.id=h.registro_id WHERE h.tabla='documentos_archivos' AND da.documento_id=$1", [own.id])).rows[0];
                assert.equal(a.n, 1);
            });
        });
        await t.test('Fallo de pertenencia revierte documento, auditoría documental y correlativo', async () => {
            const before = (await c.query('SELECT * FROM correlativos_documentales ORDER BY tipo_documental_id,anio')).rows;
            const counts = (await c.query('SELECT (SELECT count(*)::int FROM documentos) docs,(SELECT count(*)::int FROM historial_modificaciones) h')).rows[0];
            await assert.rejects(tx(fixtures.usuario.id, 'REGISTRAR', async q => {
                const id = (await q.query(`INSERT INTO documentos(tipo_documental_id,asunto,registrado_por_id,responsable_actual_id,oficina_responsable_id,estado_tramite)
                    VALUES($1,'QA rollback pertenencia',$2,$2,$3,'RECIBIDO') RETURNING id`, [fixtures.tipo, fixtures.usuario.id, fixtures.oficina])).rows[0].id;
                await q.query(`INSERT INTO documentos_archivos(documento_id,archivo_id,vinculado_por_id,fecha_vinculacion,fundamento,oficina_registro_id)
                    VALUES($1,$2,$3,clock_timestamp(),'Rechazo QA',$4)`, [id, files.otro.id, fixtures.usuario.id, fixtures.oficina]);
            }));
            assert.deepEqual((await c.query('SELECT * FROM correlativos_documentales ORDER BY tipo_documental_id,anio')).rows, before);
            assert.deepEqual((await c.query('SELECT (SELECT count(*)::int FROM documentos) docs,(SELECT count(*)::int FROM historial_modificaciones) h')).rows[0], counts);
        });
        await t.test('Vinculación individual exige fundamento y conserva íntegramente documento e historial', async () => {
            legacy = await old();
            const before = (await c.query('SELECT to_jsonb(d) fila FROM documentos d WHERE id=$1', [legacy])).rows[0].fila;
            const history = (await c.query("SELECT to_jsonb(h) fila FROM historial_modificaciones h WHERE tabla='documentos' AND registro_id=$1 ORDER BY id", [legacy])).rows;
            assert.equal((await http('GET', '/api/documentos/' + legacy, token.usuario)).documento.archivo_id, null);
            await http('POST', '/api/documentos/' + legacy + '/archivo', token.usuario, { archivo_id: files.usuario.id, fundamento: ' ' }, 400);
            await http('POST', '/api/documentos/' + legacy + '/archivo', token.usuario, { archivo_id: files.otro.id, fundamento: 'No autorizado' }, 403);
            await http('POST', '/api/documentos/' + legacy + '/archivo', token.director, { archivo_id: files.director.id, fundamento: 'No autor' }, 403);
            const linked = (await http('POST', '/api/documentos/' + legacy + '/archivo', token.usuario,
                { archivo_id: files.usuario.id, fundamento: 'Clasificación individual sustentada QA' })).documento;
            assert.equal(linked.archivo_id, files.usuario.id); assert.equal(linked.oficina_registro, fixtures.nombreOficina);
            assert.deepEqual((await c.query('SELECT to_jsonb(d) fila FROM documentos d WHERE id=$1', [legacy])).rows[0].fila, before);
            assert.deepEqual((await c.query("SELECT to_jsonb(h) fila FROM historial_modificaciones h WHERE tabla='documentos' AND registro_id=$1 ORDER BY id", [legacy])).rows, history);
            await http('POST', '/api/documentos/' + legacy + '/archivo', token.usuario, { archivo_id: files.usuario.id, fundamento: 'Repetición' }, 409);
        });
        await t.test('Dos solicitudes concurrentes: exactamente una vinculación y una respuesta 409', async () => {
            const id = await old();
            const results = await Promise.all([1, 2].map(async () => {
                const r = await fetch(base + '/api/documentos/' + id + '/archivo', { method: 'POST', headers: { Authorization: 'Bearer ' + token.usuario, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ archivo_id: files.usuario.id, fundamento: 'Concurrencia QA' }) });
                await r.json(); return r.status;
            }));
            assert.deepEqual(results.sort(), [200, 409]);
            await tx(fixtures.usuario.id, 'VINCULAR', async q => assert.equal((await q.query('SELECT count(*)::int n FROM documentos_archivos WHERE documento_id=$1', [id])).rows[0].n, 1));
        });
        await t.test('Listados, opciones, totales y detalle conservan el alcance de cada perfil', async () => {
            for (const key of ['usuario', 'director']) {
                const page = await http('GET', '/api/documentos?archivo_id=' + files.usuario.id, token[key]);
                assert.ok(page.total >= 2); assert.ok(page.documentos.every(d => d.archivo_id === files.usuario.id));
                assert.ok((await http('GET', '/api/documentos/opciones', token[key])).archivos.some(a => a.id === files.usuario.id));
            }
            for (const key of ['admin', 'otro', 'secretaria']) {
                assert.equal((await http('GET', '/api/documentos?archivo_id=' + files.usuario.id, token[key])).total, 0);
                await http('GET', '/api/documentos/' + own.id, token[key], null, 404);
                assert.ok(!(await http('GET', '/api/documentos/opciones', token[key])).archivos.some(a => a.id === files.usuario.id));
            }
        });
        await t.test('Circulación real conserva pertenencia; destinatario recibe y autor conserva consulta', async () => {
            const m = (await http('POST', '/api/movimientos', token.usuario,
                { documento_id: own.id, usuario_destino_id: fixtures.otro.id, motivo: 'Entrega física QA' }, 201)).movimiento;
            const moving = (await http('GET', '/api/documentos/' + own.id, token.usuario)).documento;
            assert.equal(moving.estado_tramite, 'EN_TRASLADO'); assert.equal(moving.archivo_id, files.usuario.id);
            assert.equal(moving.archivador_id, null);
            await http('POST', '/api/movimientos/' + m.id + '/recibir', token.director, { archivador_id: null }, 403);
            await http('POST', '/api/movimientos/' + m.id + '/recibir', token.otro, { archivador_id: null });
            const received = (await http('GET', '/api/documentos/' + own.id, token.otro)).documento;
            assert.equal(received.responsable_actual_id, fixtures.otro.id); assert.equal(received.archivo_id, files.usuario.id);
            assert.equal(received.archivo_responsable_id, fixtures.usuario.id); assert.equal(received.codigo, own.codigo);
            await http('GET', '/api/documentos/' + own.id, token.usuario);
            const unclassified = await old();
            await http('POST', '/api/movimientos', token.usuario, { documento_id: unclassified, usuario_destino_id: fixtures.otro.id, motivo: 'Pendiente QA' }, 201);
            await http('POST', '/api/documentos/' + unclassified + '/archivo', token.usuario, { archivo_id: files.usuario.id, fundamento: 'No permitido en traslado' }, 409);
        });
        await t.test('Relaciones protegidas y modelos posteriores continúan cerrados', async () => {
            await http('POST', '/api/documentos', token.usuario, { ...content, tipo_documental_id: fixtures.protegidoTipo, archivo_id: files.usuario.id }, 400);
            await http('POST', '/api/documentos/' + fixtures.protegidoDocumento + '/archivo', token.usuario, { archivo_id: files.usuario.id, fundamento: 'Acceso ordinario prohibido' }, 404);
            await tx(fixtures.usuario.id, 'VINCULAR', async q => assert.equal((await q.query('SELECT count(*)::int n FROM documentos_archivos WHERE documento_id=$1', [fixtures.protegidoDocumento])).rows[0].n, 0));
            await assert.rejects(tx(fixtures.usuario.id, 'VINCULAR', async q => {
                await q.query("SELECT set_config('app.tipo_restringido_id',$1,true)", [fixtures.protegidoTipo]);
                await q.query(`INSERT INTO documentos_archivos(documento_id,archivo_id,vinculado_por_id,fecha_vinculacion,fundamento)
                    VALUES($1,$2,$3,clock_timestamp(),'Intento SQL protegido QA')`, [fixtures.protegidoDocumento, files.usuario.id, fixtures.usuario.id]);
            }), { code: '23514' });
            for (const table of [...(primerIngresoInstalado ? [] : ['ingresos_mesa_partes']), ...(cicloInstalado ? [] : ['ingresos_actuaciones']), ...(continuidadInstalada?[]:['archivos_relevos', 'movimientos_sustituciones'])]) {
                assert.equal((await c.query('SELECT has_table_privilege(current_user,$1,\'INSERT\') permiso', [table])).rows[0].permiso, false);
                assert.ok((await c.query(`SELECT 1 FROM pg_trigger WHERE tgrelid=$1::regclass AND tgname='aa_ai_modelo_dormido' AND tgenabled='O'`, [table])).rowCount);
                await assert.rejects(tx(fixtures.usuario.id, 'VINCULAR', q => q.query(`INSERT INTO ${table} DEFAULT VALUES`)), { code: '42501' });
            }
            await assert.rejects(tx(fixtures.usuario.id, 'VINCULAR', q => q.query('UPDATE documentos_archivos SET fundamento=\'Reescritura\' WHERE documento_id=$1', [legacy])), { code: '42501' });
            await assert.rejects(tx(fixtures.usuario.id, 'VINCULAR', q => q.query('TRUNCATE documentos_archivos')), { code: '42501' });
        });
        await t.test('Con primer ingreso desactivado se conserva el contrato documental anterior', async () => {
            const opciones = await http('GET', '/api/documentos/opciones', token.usuario);
            assert.equal(opciones.primer_ingreso_ordinario_habilitado, false);
            assert.equal(opciones.puede_ingresar_mesa, false);
            assert.equal((await http('GET', '/api/documentos/' + own.id, token.usuario)).documento.ingreso_mesa_partes, undefined);
            await http('GET', '/api/ingresos/documentos/' + own.id, token.usuario, null, 409);
        });
        console.log(JSON.stringify({ httpRequests: calls + 2, database: url.pathname.slice(1), effectiveRole: rolEfectivo }));
    } finally { await new Promise(r => server.close(r)); await pool.end(); await c.end(); }
});
