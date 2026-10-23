import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { abrirSandbox } from './admin-sandbox.mjs';
import { listaDocumentosSchema } from '../../frontend/src/features/documentos/schemas/documentos.schema.ts';
import { listaMovimientosSchema } from '../../frontend/src/features/movimientos/schemas/movimientos.schema.ts';
test('Consultas documentales: autorizacion SQL real y auditoria con ROLLBACK', /** Verifica el caso «Consultas documentales: autorizacion SQL real y auditoria con ROLLBACK»; una aserción fallida invalida este resultado. */ async (t) => {
    const s = await abrirSandbox();
    /** Realiza una petición al servidor de integración del caso con el token preparado y devuelve estado y cuerpo para sus aserciones. */
    const call = async (ruta, token = s.tokenInicial) => {
        const r = await fetch(s.base + ruta, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        return { status: r.status, body: await r.json() };
    };
    try {
        const { generarToken } = await import('../dist/shared/security/jwt.js');
        const tag = randomUUID().slice(0, 8);
        const usuarioRol = (await s.cliente.query("SELECT id FROM roles WHERE nombre='Usuario'")).rows[0].id;
        const direccion = (await s.cliente.query("SELECT id FROM oficinas WHERE nombre='Dirección'")).rows[0].id;
        const directorRol = (await s.cliente.query("SELECT id FROM roles WHERE nombre='Director(a)'")).rows[0].id;
        /** Crea exclusivamente la cuenta de prueba en la conexión QA o transaccional recibida para comprobar permisos y aislamiento. */
        const crear = async (nombre, rol) => {
            const row = (await s.cliente.query(`INSERT INTO usuarios(nombre,apellido,nombre_usuario,contrasena_hash,rol_id,oficina_id) VALUES($1,'QA consultas',$2,'hash-no-utilizado-para-login',$3,$4) RETURNING id::text,version_autenticacion`, [nombre, `qa_${nombre}_${tag}`, rol, direccion])).rows[0];
            return { ...row, token: generarToken(row.id, row.version_autenticacion) };
        };
        const propietario = await crear('propietario', usuarioRol), ajeno = await crear('ajeno', usuarioRol), director = await crear('director', directorRol);
        const tipo = (await s.cliente.query("SELECT id FROM tipos_documentales WHERE nombre='Informe'")).rows[0].id;
        await s.cliente.query("SELECT set_config('app.usuario_actor_id',$1,true)", [propietario.id]);
        const doc = (await s.cliente.query(`INSERT INTO documentos(tipo_documental_id,asunto,registrado_por_id,responsable_actual_id,oficina_responsable_id) VALUES($1,$2,$3,$3,$4) RETURNING id::text,codigo`, [tipo, `Documento QA ${tag}`, propietario.id, direccion])).rows[0];
        await t.test('sin JWT no hay acceso', /** Verifica el caso «sin JWT no hay acceso»; una aserción fallida invalida este resultado. */ async () => {
            assert.equal((await call('/api/documentos', '')).status, 401);
            assert.equal((await call('/api/movimientos', '')).status, 401);
        });
        await t.test('propietario consulta y filtra; ajeno no obtiene filas ni conteos', /** Verifica el caso «propietario consulta y filtra; ajeno no obtiene filas ni conteos»; una aserción fallida invalida este resultado. */ async () => {
            const own = await call(`/api/documentos?q=${tag}`, propietario.token);
            assert.equal(own.status, 200);
            assert.equal(listaDocumentosSchema.safeParse(own.body).success, true);
            assert.equal(own.body.total, 1);
            assert.equal(own.body.documentos[0].codigo, doc.codigo);
            const other = await call(`/api/documentos?responsable_id=${propietario.id}`, ajeno.token);
            assert.equal(other.body.total, 0);
            assert.deepEqual(other.body.documentos, []);
            assert.equal((await call(`/api/documentos/${doc.id}`, ajeno.token)).status, 404);
            assert.equal((await call(`/api/documentos/${doc.id}/historial`, ajeno.token)).status, 404);
        });
        await t.test('Director consulta, Administrador tecnico no adquiere acceso global', /** Verifica el caso «Director consulta, Administrador tecnico no adquiere acceso global»; una aserción fallida invalida este resultado. */ async () => {
            assert.equal((await call(`/api/documentos/${doc.id}`, director.token)).status, 200);
            assert.equal((await call(`/api/documentos/${doc.id}`)).status, 404);
        });
        await t.test('auditoria y endpoints anteriores conservan sus contratos', /** Verifica el caso «auditoria y endpoints anteriores conservan sus contratos»; una aserción fallida invalida este resultado. */ async () => {
            const h = await call(`/api/documentos/${doc.id}/historial`, propietario.token);
            assert.equal(h.status, 200);
            assert.ok(h.body.historial.length);
            const m = await call(`/api/movimientos?documento_id=${doc.id}`, propietario.token);
            assert.equal(m.status, 200);
            assert.equal(listaMovimientosSchema.safeParse(m.body).success, true);
            assert.equal(m.body.total, 0);
            assert.equal((await call('/api/auth/me')).status, 200);
            assert.equal((await call('/api/roles')).status, 200);
            assert.equal((await call('/api/documentos?responsable_id=9223372036854775808')).status, 400);
        });
    }
    finally {
        await s.cerrar();
    }
});
