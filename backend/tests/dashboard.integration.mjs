import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import { prepararValidacion } from './flujo-migration-sandbox.mjs';
import { dashboardSchema } from '../../frontend/src/features/dashboard/schemas/dashboard.schema.ts';
test('Dashboard HTTP PostgreSQL QA aislada', /** Verifica el caso «Dashboard HTTP PostgreSQL QA aislada»; una aserción fallida invalida este resultado. */ async (t) => {
    const origen = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
        assert.equal((await origen.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='documentos' AND column_name='destinatario_autorizado_id'")).rows[0].n, 1);
    }
    finally {
        await origen.end();
    }
    process.env.VALIDAR_FLUJO_DOCUMENTAL = 'ROLLBACK_Y_QA_AISLADA';
    const qa = await prepararValidacion();
    let server, appPool;
    const sufijoQa = process.env.NEON_QA_TESTS === '1' ? '_dashboard_' + randomUUID().slice(0, 8) : '';
    try {
        process.env.DATABASE_URL = qa.connectionString;
        const { pool } = await import('../dist/config/database.js');
        appPool = pool;
        const { app } = await import('../dist/app.js');
        const { generarToken } = await import('../dist/shared/security/jwt.js');
        /** Crea exclusivamente la cuenta de prueba en la conexión QA o transaccional recibida para comprobar permisos y aislamiento. */
        const crear = async (nombre, rol, oficina) => {
            nombre += sufijoQa;
            const u = (await pool.query(`INSERT INTO usuarios(nombre,apellido,nombre_usuario,contrasena_hash,rol_id,oficina_id) SELECT $1,'QA dashboard',$1,'hash-no-login',r.id,o.id FROM roles r CROSS JOIN oficinas o WHERE r.nombre=$2 AND o.nombre=$3 RETURNING id::text,version_autenticacion`, [nombre, rol, oficina])).rows[0];
            assert.ok(u);
            return { ...u, token: generarToken(u.id, u.version_autenticacion) };
        };
        const admin = await crear('qa_admin', 'Administrador', 'Dirección'), director = await crear('qa_director', 'Director(a)', 'Dirección'), mesa = await crear('qa_mesa', 'Secretaria de Dirección', 'Mesa de Partes'), usuario = await crear('qa_usuario', 'Usuario', 'Subdirección Primaria 1'), ajeno = await crear('qa_ajeno', 'Usuario', 'Subdirección Primaria 2');
        if (!process.env.QA_HTTP_BASE) {
            server = app.listen(0, '127.0.0.1');
            await new Promise(r => server.once('listening', r));
        }
        const base = process.env.QA_HTTP_BASE ?? `http://127.0.0.1:${server.address().port}`;
        /** Realiza una petición al servidor de integración del caso con el token preparado y devuelve estado y cuerpo para sus aserciones. */
        const call = async (u, ruta = '/api/dashboard', body) => {
            const r = await fetch(base + ruta, { method: body ? 'POST' : 'GET', headers: { ...(u ? { Authorization: `Bearer ${u.token}` } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
            return { status: r.status, data: await r.json(), cache: r.headers.get('cache-control') };
        };
        /** Consulta el Dashboard QA y extrae el indicador o contrato que necesita comprobar el caso. */
        const panel = async (u) => {
            const r = await call(u);
            assert.equal(r.status, 200, JSON.stringify(r.data));
            return dashboardSchema.parse(r.data);
        };
        /** Busca el contador solicitado dentro de indicadores, operaciones y estados del panel de pruebas. */
        const valor = (p, k) => [...p.indicadores, ...p.operaciones, ...p.estados].find(i => i.clave === k)?.total ?? 0;
        const inicialDirector = process.env.NEON_QA_TESTS === '1' ? await panel(director) : null;
        // La rama heredada puede contener datos previos: comprobar el incremento de los fixtures.
        const n = (p, k) => valor(p, k) - (p.alcance === 'institucional' && inicialDirector ? valor(inicialDirector, k) : 0);
        const inicialUsuarios = (await pool.query('SELECT count(*)::int total,count(*) FILTER(WHERE activo)::int activos,count(*) FILTER(WHERE NOT activo)::int inactivos FROM usuarios')).rows[0];
        let doc, mov;
        await t.test('JWT, no-store y vacio', /** Verifica el caso «JWT, no-store y vacio»; una aserción fallida invalida este resultado. */ async () => {
            assert.equal((await call(null)).status, 401);
            assert.equal((await call(usuario)).cache, 'no-store');
            assert.equal(n(await panel(usuario), 'documentos'), 0);
        });
        await t.test('administracion exacta sin documentos', /** Verifica el caso «administracion exacta sin documentos»; una aserción fallida invalida este resultado. */ async () => {
            const p = await panel(admin);
            assert.equal(n(p, 'usuarios'), inicialUsuarios.total);
            assert.equal(n(p, 'activos'), inicialUsuarios.activos);
            assert.equal(n(p, 'inactivos'), inicialUsuarios.inactivos);
            assert.deepEqual(p.recientes, []);
            assert.deepEqual(p.estados, []);
            assert.ok(p.accesos.some(/** Selecciona las entradas de p.accesos que cumplen el criterio requerido por la comprobación. */ /** Extrae del resultado de la operación los valores que contrastan las aserciones del escenario QA. */ a => a.ruta === '/usuarios'));
        });
        await t.test('registro aislamiento y Direccion', /** Verifica el caso «registro aislamiento y Direccion»; una aserción fallida invalida este resultado. */ async () => {
            const tipo = (await pool.query("SELECT id::text FROM tipos_documentales WHERE nombre='Informe'")).rows[0].id;
            const r = await call(mesa, '/api/documentos', { tipo_documental_id: tipo, asunto: 'QA dashboard', remitente: null, observaciones: null, archivador_id: null });
            assert.equal(r.status, 201, JSON.stringify(r.data));
            doc = r.data.documento;
            assert.equal(n(await panel(mesa), 'decision'), 1);
            assert.equal(n(await panel(director), 'documentos'), 1);
            assert.equal(n(await panel(ajeno), 'documentos'), 0);
            assert.ok((await panel(director)).pendientes.some(p => p.ruta === `/documentos/${doc.id}`));
        });
        await t.test('autorizacion sin estado adicional', /** Verifica el caso «autorizacion sin estado adicional»; una aserción fallida invalida este resultado. */ async () => {
            const r = await call(director, `/api/documentos/${doc.id}/autorizar`, { usuario_destino_id: usuario.id, motivo: 'QA' });
            assert.equal(r.status, 200, JSON.stringify(r.data));
            const p = await panel(mesa);
            assert.equal(n(p, 'decision'), 0);
            assert.equal(n(p, 'salida'), 1);
            assert.equal(n(p, 'PENDIENTE_DECISION'), 1);
            assert.equal(p.pendientes[0].ruta, `/documentos/${doc.id}`);
        });
        await t.test('salida y recepcion sin conceder contenido', /** Verifica el caso «salida y recepcion sin conceder contenido»; una aserción fallida invalida este resultado. */ async () => {
            const r = await call(mesa, '/api/movimientos', { documento_id: doc.id, usuario_destino_id: usuario.id, motivo: 'QA' });
            assert.equal(r.status, 201, JSON.stringify(r.data));
            mov = r.data.movimiento;
            const p = await panel(usuario);
            assert.equal(n(p, 'recepcion'), 1);
            assert.equal(n(p, 'documentos'), 0);
            assert.equal(p.pendientes[0].ruta, `/movimientos/${mov.id}`);
            assert.equal(n(await panel(mesa), 'enviados'), 1);
        });
        await t.test('rechazo recuperacion y actualizacion', /** Verifica el caso «rechazo recuperacion y actualizacion»; una aserción fallida invalida este resultado. */ async () => {
            assert.equal((await call(usuario, `/api/movimientos/${mov.id}/rechazar`, { motivo: 'QA' })).status, 200);
            assert.equal(n(await panel(usuario), 'recepcion'), 0);
            assert.equal(n(await panel(mesa), 'recuperacion'), 1);
            assert.equal((await call(mesa, `/api/movimientos/${mov.id}/recuperar`, { motivo: 'QA', archivador_id: null, confirmar_recuperacion: true })).status, 200);
            assert.equal(n(await panel(mesa), 'recuperacion'), 0);
            assert.equal(n(await panel(mesa), 'solicitar'), 1);
        });
        await t.test('recepcion confirma custodia y elimina pendiente', /** Verifica el caso «recepcion confirma custodia y elimina pendiente»; una aserción fallida invalida este resultado. */ async () => {
            assert.equal((await call(mesa, `/api/documentos/${doc.id}/solicitar-decision`, { motivo: 'QA' })).status, 200);
            assert.equal((await call(director, `/api/documentos/${doc.id}/autorizar`, { usuario_destino_id: usuario.id, motivo: 'QA' })).status, 200);
            const salida = await call(mesa, '/api/movimientos', { documento_id: doc.id, usuario_destino_id: usuario.id, motivo: 'QA' });
            assert.equal(salida.status, 201);
            assert.equal((await call(usuario, `/api/movimientos/${salida.data.movimiento.id}/recibir`, { archivador_id: null })).status, 200);
            assert.equal(n(await panel(usuario), 'recepcion'), 0);
            assert.equal(n(await panel(usuario), 'responsabilidad'), 1);
            assert.equal(n(await panel(mesa), 'responsabilidad'), 0);
            assert.equal(n(await panel(director), 'RECIBIDO'), 1);
        });
        await t.test('SíseVe excluido de todos los agregados y listas', /** Verifica el caso «SíseVe excluido de todos los agregados y listas»; una aserción fallida invalida este resultado. */ async () => {
            const antes = await panel(director);
            const tipo = (await pool.query("SELECT id::text FROM tipos_documentales WHERE lower(nombre)='síseve'")).rows[0];
            assert.ok(tipo);
            const c = await pool.connect();
            try {
                await c.query('BEGIN');
                await c.query("SELECT set_config('app.usuario_actor_id',$1,true),set_config('app.tipo_restringido_id',$2,true)", [mesa.id, tipo.id]);
                await c.query(`INSERT INTO documentos(tipo_documental_id,asunto,registrado_por_id,responsable_actual_id,oficina_responsable_id,estado_tramite) SELECT $1,'CONFIDENCIAL QA',$2,$2,oficina_id,'PENDIENTE_DECISION' FROM usuarios WHERE id=$2`, [tipo.id, mesa.id]);
                await c.query('COMMIT');
            }
            catch (e) {
                await c.query('ROLLBACK');
                throw e;
            }
            finally {
                c.release();
            }
            for (const u of [director, mesa, admin, usuario, ajeno])
                assert.ok(!JSON.stringify(await panel(u)).includes('CONFIDENCIAL'));
            const despues = await panel(director);
            for (const k of ['indicadores', 'estados', 'operaciones', 'recientes', 'pendientes'])
                assert.deepEqual(despues[k], antes[k]);
            assert.equal(n(await panel(mesa), 'documentos'), 1);
        });
        await t.test('rol vigente y cuenta inactiva', /** Verifica el caso «rol vigente y cuenta inactiva»; una aserción fallida invalida este resultado. */ async () => {
            assert.equal((await call(ajeno, '/api/dashboard?rol=Director(a)')).data.alcance, 'personal');
            await pool.query('UPDATE usuarios SET activo=false WHERE id=$1', [ajeno.id]);
            assert.equal((await call(ajeno)).status, 401);
            assert.equal(n(await panel(admin), 'inactivos'), inicialUsuarios.inactivos + 1);
        });
        if (process.env.QA_DASHBOARD_BROWSER === 'SI') {
            const { verificarNavegador } = await import('./dashboard.browser.mjs');
            await verificarNavegador({ base, usuarios: { admin, director, mesa, usuario } });
        }
    }
    finally {
        if (server)
            await new Promise(/** Enlaza la finalización asíncrona del recurso o respuesta controlada con la promesa que espera la prueba. */  r => server.close(r));
        if (appPool)
            await appPool.end();
        process.env.DATABASE_URL = qa.original;
        await qa.limpiar();
    }
});
