import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { abrirSandbox } from './admin-sandbox.mjs';
test('Tipos y ubicaciones: contratos y permisos sobre PostgreSQL real con ROLLBACK', /** Verifica el caso «Tipos y ubicaciones: contratos y permisos sobre PostgreSQL real con ROLLBACK»; una aserción fallida invalida este resultado. */ async (t) => {
    const s = await abrirSandbox();
    const tag = randomUUID().slice(0, 8);
    let token = s.tokenInicial;
    /** Realiza una petición al servidor de integración del caso con el token preparado y devuelve estado y cuerpo para sus aserciones. */
    const call = async (path, method = 'GET', body, bearer = token) => {
        const res = await fetch(s.base + path, { method, headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return { status: res.status, body: await res.json() };
    };
    let tipos, oficinas, roles, tipo, estante, archivador, otraOficina;
    const cuentas = {};
    try {
        await t.test('autenticación obligatoria y ausencia de DELETE', /** Verifica el caso «autenticación obligatoria y ausencia de DELETE»; una aserción fallida invalida este resultado. */ async () => {
            for (const ruta of ['/api/tipos-documentales', '/api/ubicaciones/estantes', '/api/ubicaciones/archivadores', '/api/ubicaciones/opciones'])
                assert.equal((await call(ruta, 'GET', undefined, '')).status, 401);
            assert.equal((await call('/api/ubicaciones/estantes/1', 'DELETE')).status, 404);
        });
        await t.test('catálogo real e integridad del cambio de esquema autorizado', /** Verifica el caso «catálogo real e integridad del cambio de esquema autorizado»; una aserción fallida invalida este resultado. */ async () => {
            tipos = (await call('/api/tipos-documentales')).body.tipos;
            assert.equal(tipos.find(/** Selecciona las entradas de tipos que cumplen el criterio requerido por la comprobación. */ /** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ x => x.nombre === 'SíseVe').prefijo_codigo, 'SISEVE');
            assert.equal(tipos.find(/** Selecciona las entradas de tipos que cumplen el criterio requerido por la comprobación. */ /** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ x => x.nombre === 'Informe').prefijo_codigo, 'INF');
            const column = (await s.cliente.query("SELECT is_nullable FROM information_schema.columns WHERE table_name='estantes' AND column_name='oficina_id'")).rows[0];
            assert.equal(column.is_nullable, 'NO');
            oficinas = (await call('/api/oficinas')).body.oficinas;
            roles = (await call('/api/roles')).body.roles;
            otraOficina = oficinas.find(/** Selecciona las entradas de oficinas que cumplen el criterio requerido por la comprobación. */ /** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ o => o.nombre !== 'Dirección');
        });
        await t.test('registro, normalización, duplicados, detalles y edición de tipos', /** Verifica el caso «registro, normalización, duplicados, detalles y edición de tipos»; una aserción fallida invalida este resultado. */ async () => {
            let r = await call('/api/tipos-documentales', 'POST', { nombre: ` Tipo   QA ${tag} `, prefijo_codigo: 'QAZ' });
            assert.equal(r.status, 201);
            tipo = r.body.tipo;
            assert.equal(tipo.nombre, `Tipo QA ${tag}`);
            assert.equal((await call('/api/tipos-documentales', 'POST', { nombre: `tipo qa ${tag}`, prefijo_codigo: 'QAY' })).status, 409);
            assert.equal((await call('/api/tipos-documentales', 'POST', { nombre: `Otro ${tag}`, prefijo_codigo: 'QAZ' })).status, 409);
            r = await call(`/api/tipos-documentales/${tipo.id}`, 'PUT', { nombre: `Tipo editado ${tag}`, prefijo_codigo: 'QAY' });
            assert.equal(r.status, 200);
            tipo = r.body.tipo;
            assert.equal((await call(`/api/tipos-documentales/${tipo.id}`)).body.tipo.prefijo_codigo, 'QAY');
            assert.equal((await call('/api/tipos-documentales', 'POST', { nombre: 'Tipo inválido', prefijo_codigo: '123' })).status, 400);
            assert.equal((await call('/api/tipos-documentales', 'POST', { nombre: 'Tipo inválido', prefijo_codigo: null, requiere_clave: true })).status, 400);
        });
        await t.test('protecciones institucionales, SíseVe y correlativos históricos', /** Verifica el caso «protecciones institucionales, SíseVe y correlativos históricos»; una aserción fallida invalida este resultado. */ async () => {
            for (const nombre of ['Informe', 'SíseVe']) {
                const tipo = tipos.find(/** Selecciona las entradas de tipos que cumplen el criterio requerido por la comprobación. */ /** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ x => x.nombre === nombre);
                assert.equal((await call(`/api/tipos-documentales/${tipo.id}`, 'PUT', { nombre: 'Renombrado', prefijo_codigo: 'ZZZ' })).status, 409);
            }
            await s.cliente.query('INSERT INTO correlativos_documentales(tipo_documental_id,anio,ultimo_numero) VALUES($1,2026,1)', [tipo.id]);
            assert.equal((await call(`/api/tipos-documentales/${tipo.id}`, 'PUT', { nombre: tipo.nombre, prefijo_codigo: 'QAX' })).status, 409);
            assert.equal((await call(`/api/tipos-documentales/${tipo.id}`, 'PUT', { nombre: `Historia ${tag}`, prefijo_codigo: 'QAY' })).status, 200);
        });
        await t.test('cuentas transaccionales autenticadas con contraseñas reales', /** Verifica el caso «cuentas transaccionales autenticadas con contraseñas reales»; una aserción fallida invalida este resultado. */ async () => {
            const direccion = oficinas.find(/** Selecciona las entradas de oficinas que cumplen el criterio requerido por la comprobación. */ /** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ o => o.nombre === 'Dirección');
            for (const [clave, rol, oficina] of [['a', 'Usuario', otraOficina], ['b', 'Usuario', otraOficina], ['c', 'Usuario', otraOficina], ['director', 'Director(a)', direccion]]) {
                const password = `Clave-qa-${tag}`;
                const r = await call('/api/usuarios', 'POST', { nombre: `QA ${clave}`, apellido: 'Ubicaciones', nombre_usuario: `qa_${clave}_${tag}`, email: null, telefono: null, rol_id: roles.find(/** Selecciona las entradas de roles que cumplen el criterio requerido por la comprobación. */ /** Localiza el rol real del catálogo utilizado por el actor o cuenta efímera de esta prueba. */ r => r.nombre === rol).id, oficina_id: oficina.id, contrasena: password });
                assert.equal(r.status, 201);
                const login = await call('/api/auth/login', 'POST', { identificador: r.body.usuario.nombre_usuario, contrasena: password }, '');
                assert.equal(login.status, 200);
                cuentas[clave] = { ...r.body.usuario, token: login.body.token };
            }
        });
        await t.test('catálogo consultable por usuarios sin administración documental', /** Verifica el caso «catálogo consultable por usuarios sin administración documental»; una aserción fallida invalida este resultado. */ async () => {
            assert.equal((await call('/api/tipos-documentales', 'GET', undefined, cuentas.a.token)).status, 200);
            assert.equal((await call('/api/tipos-documentales', 'POST', { nombre: 'Prohibido', prefijo_codigo: 'ZZZ' }, cuentas.a.token)).status, 403);
        });
        await t.test('crear y editar estante propio, duplicados y aislamiento de misma oficina', /** Verifica el caso «crear y editar estante propio, duplicados y aislamiento de misma oficina»; una aserción fallida invalida este resultado. */ async () => {
            const datos = { codigo: 'QA', oficina_id: otraOficina.id, usuario_id: cuentas.a.id };
            let r = await call('/api/ubicaciones/estantes', 'POST', datos, cuentas.a.token);
            assert.equal(r.status, 201);
            estante = r.body.estante;
            assert.equal((await call('/api/ubicaciones/estantes', 'POST', datos, cuentas.a.token)).status, 409);
            r = await call('/api/ubicaciones/estantes', 'POST', { ...datos, usuario_id: cuentas.b.id }, cuentas.b.token);
            assert.equal(r.status, 201);
            const lista = (await call('/api/ubicaciones/estantes', 'GET', undefined, cuentas.a.token)).body.estantes;
            assert.equal(lista.length, 1);
            assert.equal(lista[0].usuario_id, cuentas.a.id);
            assert.equal((await call(`/api/ubicaciones/estantes/${estante.id}`, 'GET', undefined, cuentas.b.token)).status, 404);
            assert.equal((await call(`/api/ubicaciones/estantes/${estante.id}`, 'PUT', datos, cuentas.b.token)).status, 404);
            assert.equal((await call('/api/ubicaciones/estantes', 'POST', { ...datos, usuario_id: cuentas.b.id }, cuentas.a.token)).status, 403);
            r = await call(`/api/ubicaciones/estantes/${estante.id}`, 'PUT', { ...datos, codigo: 'QAA' }, cuentas.a.token);
            assert.equal(r.status, 200);
            estante = r.body.estante;
            assert.equal((await call('/api/ubicaciones/estantes', 'POST', { ...datos, codigo: '123' }, cuentas.a.token)).status, 400);
        });
        await t.test('crear y editar archivador, duplicados, integridad y acceso', /** Verifica el caso «crear y editar archivador, duplicados, integridad y acceso»; una aserción fallida invalida este resultado. */ async () => {
            let r = await call('/api/ubicaciones/archivadores', 'POST', { estante_id: estante.id, numero: 1 }, cuentas.a.token);
            assert.equal(r.status, 201);
            archivador = r.body.archivador;
            assert.equal((await call('/api/ubicaciones/archivadores', 'POST', { estante_id: estante.id, numero: 1 }, cuentas.a.token)).status, 409);
            assert.equal((await call('/api/ubicaciones/archivadores', 'POST', { estante_id: estante.id, numero: 0 }, cuentas.a.token)).status, 400);
            assert.equal((await call('/api/ubicaciones/archivadores', 'POST', { estante_id: '9223372036854775807', numero: 1 }, cuentas.a.token)).status, 404);
            assert.equal((await call(`/api/ubicaciones/archivadores/${archivador.id}`, 'GET', undefined, cuentas.b.token)).status, 404);
            assert.equal((await call(`/api/ubicaciones/archivadores/${archivador.id}`, 'PUT', { estante_id: estante.id, numero: 2 }, cuentas.b.token)).status, 404);
            r = await call(`/api/ubicaciones/archivadores/${archivador.id}`, 'PUT', { estante_id: estante.id, numero: 2 }, cuentas.a.token);
            assert.equal(r.status, 200);
            assert.equal(r.body.archivador.estante_id, estante.id);
            assert.equal((await call(`/api/ubicaciones/estantes/${estante.id}`, 'GET', undefined, cuentas.a.token)).body.archivadores.length, 1);
        });
        await t.test('documento transaccional conserva ubicacion y bloquea el cambio de prefijo', /** Verifica el caso «documento transaccional conserva ubicacion y bloquea el cambio de prefijo»; una aserción fallida invalida este resultado. */ async () => {
            // Fixture SQL revertida: respeta el estado inicial institucional vigente y ejercita las FK.
            const r = await call('/api/tipos-documentales', 'POST', { nombre: `Tipo con referencia ${tag}`, prefijo_codigo: 'QAR' });
            assert.equal(r.status, 201);
            await s.cliente.query("SELECT set_config('app.usuario_actor_id',$1,true)", [cuentas.a.id]);
            const documento = (await s.cliente.query(`INSERT INTO documentos(tipo_documental_id,asunto,archivador_id,registrado_por_id,responsable_actual_id,oficina_responsable_id,estado_tramite)
   VALUES($1,'Fixture transaccional de integridad',$2,$3,$3,$4,CASE WHEN (SELECT nombre FROM oficinas WHERE id=$4)='Mesa de Partes' THEN 'PENDIENTE_DECISION' ELSE 'RECIBIDO' END) RETURNING id::text,codigo`, [r.body.tipo.id, archivador.id, cuentas.a.id, otraOficina.id])).rows[0];
            assert.ok(documento.codigo.startsWith('QAR'));
            assert.equal((await call(`/api/tipos-documentales/${r.body.tipo.id}`, 'PUT', { nombre: r.body.tipo.nombre, prefijo_codigo: 'QAS' })).status, 409);
            assert.equal((await call(`/api/ubicaciones/archivadores/${archivador.id}`, 'PUT', { estante_id: estante.id, numero: 3 })).status, 200);
            assert.equal((await s.cliente.query('SELECT archivador_id::text FROM documentos WHERE id=$1', [documento.id])).rows[0].archivador_id, archivador.id);
        });
        await t.test('Dirección consulta todas las ubicaciones pero no modifica las ajenas', /** Verifica el caso «Dirección consulta todas las ubicaciones pero no modifica las ajenas»; una aserción fallida invalida este resultado. */ async () => {
            const totalEstantes = (await s.cliente.query('SELECT count(*)::int n FROM estantes')).rows[0].n;
            assert.equal((await call('/api/ubicaciones/estantes', 'GET', undefined, cuentas.director.token)).body.estantes.length, totalEstantes);
            assert.equal((await call(`/api/ubicaciones/archivadores/${archivador.id}`, 'GET', undefined, cuentas.director.token)).status, 200);
            assert.equal((await call(`/api/ubicaciones/estantes/${estante.id}`, 'PUT', { codigo: estante.codigo, usuario_id: cuentas.a.id, oficina_id: otraOficina.id }, cuentas.director.token)).status, 403);
            assert.equal((await call(`/api/ubicaciones/archivadores/${archivador.id}`, 'PUT', { estante_id: estante.id, numero: 3 }, cuentas.director.token)).status, 403);
        });
        await t.test('oficina estable al trasladar cuenta; reasignación administrativa preserva IDs', /** Verifica el caso «oficina estable al trasladar cuenta; reasignación administrativa preserva IDs»; una aserción fallida invalida este resultado. */ async () => {
            await s.cliente.query('UPDATE usuarios SET oficina_id=$2 WHERE id=$1', [cuentas.a.id, oficinas.find(/** Selecciona las entradas de oficinas que cumplen el criterio requerido por la comprobación. */ /** Obtiene o compara el identificador del fixture para verificar asociaciones sin perder la precisión bigint. */ o => o.id !== otraOficina.id).id]);
            assert.equal((await call(`/api/ubicaciones/estantes/${estante.id}`)).body.estante.oficina_id, otraOficina.id);
            const datos = { codigo: estante.codigo, usuario_id: cuentas.c.id, oficina_id: otraOficina.id };
            assert.equal((await call(`/api/ubicaciones/estantes/${estante.id}`, 'PUT', { ...datos, usuario_id: cuentas.director.id })).status, 400);
            assert.equal((await call(`/api/ubicaciones/estantes/${estante.id}`, 'PUT', { ...datos, oficina_id: cuentas.director.oficina_id })).status, 409);
            const r = await call(`/api/ubicaciones/estantes/${estante.id}`, 'PUT', datos);
            assert.equal(r.status, 200);
            assert.equal(r.body.estante.id, estante.id);
            assert.equal(r.body.estante.usuario_id, cuentas.c.id);
            assert.equal((await call(`/api/ubicaciones/estantes/${estante.id}`, 'GET', undefined, cuentas.a.token)).status, 404);
            assert.equal((await call(`/api/ubicaciones/archivadores/${archivador.id}`, 'GET', undefined, cuentas.c.token)).body.archivador.estante_id, estante.id);
        });
        await t.test('cuenta inactiva conserva ubicaciones y se permite reasignar a encargado activo', /** Verifica el caso «cuenta inactiva conserva ubicaciones y se permite reasignar a encargado activo»; una aserción fallida invalida este resultado. */ async () => {
            assert.equal((await call(`/api/usuarios/${cuentas.c.id}/estado`, 'PATCH', { activo: false })).status, 200);
            const detalle = (await call(`/api/ubicaciones/estantes/${estante.id}`)).body.estante;
            assert.equal(detalle.responsable_activo, false);
            assert.equal((await call(`/api/ubicaciones/estantes/${estante.id}`, 'GET', undefined, cuentas.c.token)).status, 401);
            assert.equal((await call(`/api/ubicaciones/estantes/${estante.id}`, 'PUT', { codigo: estante.codigo, usuario_id: cuentas.b.id, oficina_id: otraOficina.id })).status, 200);
        });
        await t.test('opciones no filtran identidades ajenas a usuarios; auditoría conserva reasignación', /** Verifica el caso «opciones no filtran identidades ajenas a usuarios; auditoría conserva reasignación»; una aserción fallida invalida este resultado. */ async () => {
            const opciones = (await call('/api/ubicaciones/opciones', 'GET', undefined, cuentas.b.token)).body;
            assert.deepEqual(opciones.responsables, []);
            assert.equal(opciones.oficinas.length, 1);
            const cambios = (await s.cliente.query("SELECT usuario_actor_id::text,campos_modificados FROM historial_modificaciones WHERE tabla='estantes' AND registro_id=$1 ORDER BY id", [estante.id])).rows;
            assert.ok(cambios.some(/** Selecciona las entradas de cambios que cumplen el criterio requerido por la comprobación. */ /** Comprueba que la fila pertenezca al actor o al estado admitido por la bandeja del caso QA. */ c => c.usuario_actor_id === s.idInicial && c.campos_modificados.usuario_id));
            assert.equal((await call('/api/auth/me')).status, 200);
            assert.equal((await call('/api/roles')).status, 200);
            assert.equal((await call('/api/oficinas')).status, 200);
            assert.equal((await call('/api/usuarios')).status, 200);
        });
    }
    finally {
        await s.cerrar();
    }
});
