import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { URL } from 'node:url';
import pg from 'pg';

// Ejecucion explicita: node --import tsx --test tests/archivos.integration.mjs.
// No carga .env, no crea bases, no aplica migraciones ni eleva el rol efectivo.
assert.equal(process.env.ARCHIVOS_QA_AUTORIZADA, 'SOLO_COPIA_LOCAL');
const rolEfectivo = process.env.ARCHIVOS_QA_ROL_EFECTIVO ?? 'sistema_documental_app';
assert.ok(['sistema_documental_app','sistema_web_app'].includes(rolEfectivo));
const url = new URL(process.env.DATABASE_URL);
assert.match(url.pathname, /^\/sistema_web_final_qa_archivo_[a-f0-9]{32}$/);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
const oid = Number(process.env.ARCHIVOS_QA_OID);
assert.ok(Number.isInteger(oid) && oid > 0);
const fixtures = JSON.parse(process.env.ARCHIVOS_QA_FIXTURES);
process.env.DB_PROFILE = 'local';
process.env.RENDER = 'false';
process.env.NODE_ENV = 'test';
process.env.DOTENV_CONFIG_PATH = '.private/no-cargar-env-en-qa';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.CORS_ORIGINS = '';
process.env.TRUST_PROXY_HOPS = '0';

/** Comprueba identidad y privilegios antes de permitir solicitudes o escrituras. */
async function guarda(c) {
    const r = (await c.query(`SELECT current_database() base,current_user rol,
     inet_server_addr()::text host,inet_server_port() puerto,
     (SELECT oid FROM pg_database WHERE datname=current_database()) oid,
     (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) elevado`)).rows[0];
    assert.equal('/' + r.base, url.pathname);
    assert.equal(r.oid, oid);
    assert.ok(['::1/128', '127.0.0.1/32'].includes(r.host));
    assert.equal(r.puerto, Number(url.port || 5432));
    assert.equal(r.rol, rolEfectivo);
    assert.equal(r.elevado, false);
}

test('Archivos administrativos en copia QA con rol restringido', async t => {
    const c = new pg.Client({ connectionString: url.toString() });
    await c.connect();
    const continuidadInstalada=(await c.query("SELECT to_regprocedure('public.fn_ai_continuidad_operacion()') IS NOT NULL v")).rows[0].v;
    const cicloInstalado = (await c.query("SELECT to_regprocedure('public.fn_mp_ciclo()') IS NOT NULL v")).rows[0].v;
    await guarda(c);
    const vinculacionInstalada = (await c.query("SELECT to_regprocedure('public.fn_ai_pertenencia_ordinaria()') IS NOT NULL habilitada")).rows[0].habilitada;
    const primerIngresoInstalado = (await c.query("SELECT to_regprocedure('public.fn_mp_validar_primera_presentacion()') IS NOT NULL habilitada")).rows[0].habilitada;
    const { app } = await import('../src/app.ts');
    const { pool } = await import('../src/config/database.ts');
    const pc = await pool.connect();
    await guarda(pc);
    pc.release();
    const server = await new Promise(resolve => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const base = 'http://127.0.0.1:' + server.address().port;
    const suffix = randomBytes(5).toString('hex');
    let requests = 0;
    /** Petición sin imprimir JWT, contraseñas o respuestas con información personal. */
    async function http(method, path, token, body, status = 200) {
        await guarda(c);
        requests++;
        const r = await fetch(base + path, { method, headers: {
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        }, ...(body ? { body: JSON.stringify(body) } : {}) });
        const data = await r.json();
        assert.equal(r.status, status, method + ' ' + path + ' -> ' + r.status + ' ' + (data.error ?? ''));
        return data;
    }
    /** Transacción directa del mismo rol para probar RLS e invariantes del servidor. */
    async function tx(actor, fn, action = 'CREAR', motivo = 'Prueba transaccional QA') {
        await guarda(c);
        await c.query('BEGIN');
        try {
            await c.query("SELECT pg_advisory_xact_lock(hashtext('administracion-institucional'))");
            await c.query("SELECT set_config('app.usuario_actor_id',$1,true),set_config('app.archivo_operacion',$2,true),set_config('app.motivo_documental',$3,true)", [actor, action, motivo]);
            const r = await fn(c);
            await c.query('COMMIT');
            return r;
        } catch (e) { await c.query('ROLLBACK'); throw e; }
    }
    const login = async u => (await http('POST', '/api/auth/login', null, {
        identificador: u.nombre_usuario, contrasena: fixtures.password,
    })).token;
    const tokens = {};
    let archivo;
    const data = { nombre: 'Archivo QA ' + suffix, responsabilidad: 'Responsabilidad institucional de prueba',
        oficina_id: fixtures.oficina, responsable_id: fixtures.usuario.id, motivo: 'Asignacion inicial QA' };
    try {
        for (const key of ['admin', 'director', 'secretaria', 'usuario']) tokens[key] = await login(fixtures[key]);
        await t.test('Administrador crea archivo y asignacion conjuntamente, con proyeccion cerrada', async () => {
            archivo = (await http('POST', '/api/archivos', tokens.admin, data, 201)).archivo;
            assert.equal(archivo.responsable_id, fixtures.usuario.id);
            assert.equal(archivo.oficina_id, fixtures.oficina);
            assert.deepEqual(Object.keys(archivo).sort(), ['id', 'nombre', 'responsabilidad', 'oficina_id', 'oficina',
                'creado_por_id', 'creador', 'fecha_creacion', 'motivo', 'asignacion_id', 'responsable_id', 'responsable', 'fecha_inicio'].sort());
            const hist = await http('GET', `/api/archivos/${archivo.id}/asignaciones`, tokens.admin);
            assert.equal(hist.total, 1);
            assert.equal(hist.asignaciones[0].fecha_fin, null);
            assert.equal(hist.asignaciones[0].motivo, data.motivo);
            await tx(fixtures.admin.id, async q => {
                assert.equal((await q.query('SELECT count(*)::int n FROM auditoria_archivistica WHERE (tabla=$1 AND registro_id=$2) OR (tabla=$3 AND registro_id=$4)',
                    ['archivos_institucionales', archivo.id, 'archivos_asignaciones', archivo.asignacion_id])).rows[0].n, 2);
                assert.equal((await q.query('SELECT a.fecha_creacion=s.fecha_inicio coincide FROM archivos_institucionales a JOIN archivos_asignaciones s ON s.archivo_id=a.id WHERE a.id=$1', [archivo.id])).rows[0].coincide, true);
            });
        });
        await t.test('Paginacion, busqueda literal y filtros por oficina/responsable', async () => {
            const list = await http('GET', `/api/archivos?q=${suffix}&oficina_id=${fixtures.oficina}&responsable_id=${fixtures.usuario.id}&limite=1`, tokens.admin);
            assert.equal(list.total, 1); assert.equal(list.archivos.length, 1); assert.equal(list.limite, 1);
            assert.equal((await http('GET', `/api/archivos?q=${suffix}&responsable_id=${fixtures.director.id}`, tokens.admin)).total, 0);
            assert.equal((await http('GET', `/api/archivos?q=${suffix}&pagina=2&limite=1`, tokens.admin)).archivos.length, 0);
            await http('GET', '/api/archivos?limite=101', tokens.admin, null, 400);
            await http('GET', '/api/archivos/9223372036854775807', tokens.admin, null, 404);
        });
        await t.test('Referencias inexistentes, inactivo, oficina distinta y rol incompatible se rechazan', async () => {
            const variants = [{ oficina_id: '9223372036854775807' }, { responsable_id: '9223372036854775807' },
                { responsable_id: fixtures.inactivo.id }, { responsable_id: fixtures.director.id },
                { responsable_id: fixtures.incompatible.id }];
            for (const [i, variant] of variants.entries()) await http('POST', '/api/archivos', tokens.admin, { ...data, nombre: 'Invalido ' + suffix + i, ...variant }, 400);
            assert.equal((await http('GET', '/api/archivos?q=Invalido%20' + suffix, tokens.admin)).total, 0);
        });
        await t.test('Denominacion normalizada unica dentro de la oficina', async () => {
            await http('POST', '/api/archivos', tokens.admin, { ...data, nombre: '  ARCHIVO   QA ' + suffix + ' ' }, 409);
        });
        await t.test('Solicitudes concurrentes incompatibles dejan un solo archivo y responsable', async () => {
            const body = { ...data, nombre: 'Concurrente ' + suffix };
            const responses = await Promise.all([1, 2].map(() => fetch(base + '/api/archivos', {
                method: 'POST', headers: { Authorization: 'Bearer ' + tokens.admin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
            })));
            requests += 2;
            assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
            for (const r of responses) await r.json();
            const list = await http('GET', '/api/archivos?q=Concurrente%20' + suffix, tokens.admin);
            assert.equal(list.total, 1);
            assert.equal((await http('GET', `/api/archivos/${list.archivos[0].id}/asignaciones`, tokens.admin)).total, 1);
        });
        await t.test('Correccion exige motivo, conserva auditoria y no modifica asignaciones', async () => {
            const before = await http('GET', `/api/archivos/${archivo.id}/asignaciones`, tokens.admin);
            const body = { nombre: data.nombre, responsabilidad: 'Finalidad corregida QA' };
            await http('PUT', `/api/archivos/${archivo.id}`, tokens.admin, body, 400);
            await http('PUT', `/api/archivos/${archivo.id}`, tokens.admin, { ...body, motivo: ' ' }, 400);
            await http('PUT', `/api/archivos/${archivo.id}`, tokens.admin, { ...body, motivo: 'Correccion administrativa QA' });
            for (const extra of [{ responsable_id: fixtures.director.id }, { oficina_id: fixtures.direccion }, { fecha_inicio: '2026-01-01' }])
                await http('PUT', `/api/archivos/${archivo.id}`, tokens.admin, { ...body, motivo: 'Intento no permitido', ...extra }, 400);
            assert.deepEqual(await http('GET', `/api/archivos/${archivo.id}/asignaciones`, tokens.admin), before);
            await tx(fixtures.admin.id, async q => {
                const h = (await q.query("SELECT usuario_actor_id::text,campos_modificados FROM auditoria_archivistica WHERE tabla='archivos_institucionales' AND registro_id=$1 AND accion='MODIFICAR' ORDER BY id DESC LIMIT 1", [archivo.id])).rows[0];
                assert.equal(h.usuario_actor_id, fixtures.admin.id);
                assert.equal(h.campos_modificados.motivo.antes, data.motivo);
                assert.equal(h.campos_modificados.motivo.despues, 'Correccion administrativa QA');
                assert.equal(h.campos_modificados.responsabilidad.antes, data.responsabilidad);
            });
        });
        await t.test('Fallo de asignacion revierte archivo y auditoria de la transaccion', async () => {
            const name = 'Rollback ' + suffix;
            const auditBefore = await tx(fixtures.admin.id, async q => (await q.query('SELECT count(*)::int n FROM auditoria_archivistica')).rows[0].n);
            await assert.rejects(tx(fixtures.admin.id, async q => {
                const a = (await q.query(`INSERT INTO archivos_institucionales(oficina_id,nombre,responsabilidad,creado_por_id,fecha_creacion,motivo)
                 VALUES($1,$2,'QA',$3,clock_timestamp(),'Prueba transaccional QA') RETURNING id`, [fixtures.oficina, name, fixtures.admin.id])).rows[0];
                await q.query(`INSERT INTO archivos_asignaciones(archivo_id,responsable_id,fecha_inicio,formalizado_por_id,motivo)
                 VALUES($1,$2,clock_timestamp(),$3,'Prueba transaccional QA')`, [a.id, fixtures.inactivo.id, fixtures.admin.id]);
            }), e => e.code === '23514');
            assert.equal((await http('GET', '/api/archivos?q=' + encodeURIComponent(name), tokens.admin)).total, 0);
            assert.equal(await tx(fixtures.admin.id, async q => (await q.query('SELECT count(*)::int n FROM auditoria_archivistica')).rows[0].n), auditBefore);
        });
        await t.test('Trigger diferible impide confirmar un archivo sin responsable', async () => {
            const name = 'Sin responsable ' + suffix;
            await assert.rejects(tx(fixtures.admin.id, q => q.query(`INSERT INTO archivos_institucionales(oficina_id,nombre,responsabilidad,creado_por_id,fecha_creacion,motivo)
             VALUES($1,$2,'QA',$3,clock_timestamp(),'Prueba transaccional QA')`, [fixtures.oficina, name, fixtures.admin.id])), e => e.code === '23514');
            assert.equal((await http('GET', '/api/archivos?q=' + encodeURIComponent(name), tokens.admin)).total, 0);
        });
        await t.test('No hay escritura arbitraria de historia, oficina o auditoria', async () => {
            for (const sql of ['UPDATE archivos_asignaciones SET motivo=\'alterado\'', 'DELETE FROM archivos_institucionales',
                'UPDATE archivos_institucionales SET oficina_id=oficina_id', 'UPDATE auditoria_archivistica SET accion=accion',
                'TRUNCATE auditoria_archivistica']) await assert.rejects(tx(fixtures.admin.id, q => q.query(sql), 'CORREGIR'), e => e.code === '42501');
            await assert.rejects(tx(fixtures.admin.id, q => q.query(`INSERT INTO auditoria_archivistica(tabla,registro_id,accion,usuario_actor_id,campos_modificados)
             VALUES('archivos_institucionales',$1,'CREAR',$2,'{}')`, [archivo.id, fixtures.admin.id])), e => e.code === '55000');
            await assert.rejects(tx(fixtures.admin.id, q => q.query(`INSERT INTO archivos_asignaciones(archivo_id,responsable_id,fecha_inicio,formalizado_por_id,motivo)
             VALUES($1,$2,clock_timestamp(),$3,'Prueba transaccional QA')`, [archivo.id, fixtures.usuario.id, fixtures.admin.id])), e => e.code === '23514');
        });
        await t.test('HTTP y servicio rechazan otros perfiles; RLS filtra filas reales sin actor administrativo', async () => {
            const { listar } = await import('../src/modules/archivos/archivos.service.ts');
            for (const key of ['director', 'secretaria', 'usuario']) {
                for (const [method, path, body] of [['GET', '/api/archivos'], ['GET', '/api/archivos/' + archivo.id],
                    ['GET', `/api/archivos/${archivo.id}/asignaciones`], ['POST', '/api/archivos', data],
                    ['PUT', '/api/archivos/' + archivo.id, { nombre: data.nombre, responsabilidad: 'QA', motivo: 'QA' }]])
                    await http(method, path, tokens[key], body, 403);
                await assert.rejects(listar(fixtures[key].id, { pagina: 1, limite: 10, q: '' }), e => e.status === 403);
            }
            await http('GET', '/api/archivos', null, null, 401);
            await http('POST', '/api/archivos', null, data, 401);
            assert.equal((await c.query('SELECT count(*)::int n FROM archivos_institucionales')).rows[0].n, 0);
            await tx(fixtures.usuario.id, async q => {
                const n = (await q.query('SELECT count(*)::int n FROM archivos_institucionales')).rows[0].n;
                // 005 permite metadatos propios en SQL; el endpoint administrativo sigue rechazando al usuario.
                if (vinculacionInstalada) assert.ok(n >= 1); else assert.equal(n, 0);
            });
            await tx(fixtures.admin.id, async q => assert.ok((await q.query('SELECT count(*)::int n FROM archivos_institucionales')).rows[0].n >= 2));
        });
        await t.test('Administrador no vincula documentos y los modulos posteriores siguen cerrados', async () => {
            await assert.rejects(tx(fixtures.admin.id, q => q.query('INSERT INTO documentos_archivos DEFAULT VALUES')),
                e => e.code === (vinculacionInstalada ? '55000' : '42501'));
            for (const table of ['ingresos_mesa_partes', 'movimientos_ingresos'])
                await assert.rejects(tx(fixtures.admin.id, q => q.query(`INSERT INTO ${table} DEFAULT VALUES`)),
                    e => e.code === (primerIngresoInstalado ? '23514' : '42501'));
            for (const table of [...(cicloInstalado ? [] : ['ingresos_actuaciones']),
                ...(continuidadInstalada?[]:['archivos_relevos', 'relevos_documentos', 'movimientos_sustituciones', 'sustituciones_actuaciones'])]) {
                await assert.rejects(tx(fixtures.admin.id, q => q.query(`INSERT INTO ${table} DEFAULT VALUES`)), e => e.code === '42501');
            }
        });
        t.diagnostic('Solicitudes HTTP del modulo: ' + requests + '; rol efectivo restringido comprobado en SQL y pool de Express.');
    } finally {
        await new Promise(resolve => server.close(resolve));
        await pool.end();
        await c.end();
    }
});
