import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { abrirSandbox } from './admin-sandbox.mjs';
test('Administración: HTTP, SQL, auditoría y permisos reales con ROLLBACK autorizado', /** Verifica el caso «Administración: HTTP, SQL, auditoría y permisos reales con ROLLBACK autorizado»; una aserción fallida invalida este resultado. */ async (t) => {
    const sandbox = await abrirSandbox();
    let token = sandbox.tokenInicial;
    const sufijo = randomUUID().slice(0, 8);
    const secreto = `Clave-integracion-${sufijo}`;
    /** Realiza una petición al servidor de integración del caso con el token preparado y devuelve estado y cuerpo para sus aserciones. */
    const call = async (path, method = 'GET', body, bearer = token) => {
        const res = await fetch(sandbox.base + path, { method, headers: {
                ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
            }, body: body ? JSON.stringify(body) : undefined });
        return { status: res.status, body: await res.json() };
    };
    let roles, oficinas, rolCreado, oficinaCreada, cuenta, adminQa;
    /** Construye datos de una cuenta efímera con sufijo único para evitar conflictos entre ejecuciones. */
    const usuarioDatos = (rolId, oficinaId) => ({ nombre: 'Prueba', apellido: 'Transaccional', nombre_usuario: `qa_${sufijo}`,
        email: `qa_${sufijo}@example.invalid`, telefono: null, rol_id: rolId, oficina_id: oficinaId });
    try {
        await t.test('anónimo recibe 401 y no existe eliminación física', /** Verifica el caso «anónimo recibe 401 y no existe eliminación física»; una aserción fallida invalida este resultado. */ async () => {
            for (const ruta of ['/api/roles', '/api/oficinas', '/api/usuarios'])
                assert.equal((await call(ruta, 'GET', undefined, '')).status, 401);
            assert.equal((await call('/api/roles/1', 'DELETE')).status, 404);
        });
        await t.test('catálogos e identificadores inválidos', /** Verifica el caso «catálogos e identificadores inválidos»; una aserción fallida invalida este resultado. */ async () => {
            const r = await call('/api/roles');
            const o = await call('/api/oficinas');
            assert.equal(r.status, 200);
            assert.equal(o.status, 200);
            roles = r.body.roles;
            oficinas = o.body.oficinas;
            assert.ok(roles.find(/** Selecciona las entradas de roles que cumplen el criterio requerido por la comprobación. */ /** Localiza el rol real del catálogo utilizado por el actor o cuenta efímera de esta prueba. */ rol => rol.nombre === 'Administrador').reservado);
            for (const id of ['abc', '0', '9223372036854775808'])
                assert.equal((await call(`/api/roles/${id}`)).status, 400);
        });
        await t.test('no se modifica ni desactiva al último Administrador institucional', /** Verifica el caso «no se modifica ni desactiva al último Administrador institucional»; una aserción fallida invalida este resultado. */ async () => {
            const consulta = await call(`/api/usuarios/${sandbox.idInicial}`);
            const actual = consulta.body.usuario;
            const { nombre, apellido, nombre_usuario, email, telefono } = actual;
            const datos = { nombre, apellido, nombre_usuario, email, telefono,
                rol_id: roles.find(/** Selecciona las entradas de roles que cumplen el criterio requerido por la comprobación. */ /** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ r => r.nombre === 'Usuario').id, oficina_id: oficinas.find(/** Selecciona las entradas de oficinas que cumplen el criterio requerido por la comprobación. */ /** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ o => o.nombre === 'Dirección').id };
            assert.equal((await call(`/api/usuarios/${sandbox.idInicial}/estado`, 'PATCH', { activo: false })).status, 409);
            assert.equal((await call(`/api/usuarios/${sandbox.idInicial}`, 'PUT', datos)).status, 409);
        });
        await t.test('crear una cuenta administradora de QA por el endpoint real y autenticar con scrypt', /** Verifica el caso «crear una cuenta administradora de QA por el endpoint real y autenticar con scrypt»; una aserción fallida invalida este resultado. */ async () => {
            const res = await call('/api/usuarios', 'POST', { ...usuarioDatos(roles.find(/** Selecciona las entradas de roles que cumplen el criterio requerido por la comprobación. */ /** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ r => r.nombre === 'Administrador').id, null), nombre_usuario: `adminqa_${sufijo}`, email: null, contrasena: secreto });
            assert.equal(res.status, 201);
            adminQa = res.body.usuario;
            const login = await call('/api/auth/login', 'POST', { identificador: adminQa.nombre_usuario, contrasena: secreto }, '');
            assert.equal(login.status, 200);
            token = login.body.token;
            assert.equal((await call('/api/auth/me')).status, 200);
        });
        await t.test('crear, consultar y editar un rol; duplicados normalizados y reservados', /** Verifica el caso «crear, consultar y editar un rol; duplicados normalizados y reservados»; una aserción fallida invalida este resultado. */ async () => {
            const res = await call('/api/roles', 'POST', { nombre: `  Rol   QA ${sufijo}  ` });
            assert.equal(res.status, 201);
            rolCreado = res.body.registro;
            assert.equal(rolCreado.nombre, `Rol QA ${sufijo}`);
            assert.equal((await call('/api/roles', 'POST', { nombre: `rOL  qa ${sufijo}` })).status, 409);
            assert.equal((await call(`/api/roles/${rolCreado.id}`, 'PUT', { nombre: `Rol editado ${sufijo}` })).status, 200);
            assert.equal((await call(`/api/roles/${rolCreado.id}`)).status, 200);
            assert.equal((await call(`/api/roles/${roles[0].id}`, 'PUT', { nombre: 'Cambiar reservado' })).status, 409);
            assert.equal((await call('/api/roles', 'POST', { nombre: '   ' })).status, 400);
        });
        await t.test('crear, editar y consultar oficina y proteger denominaciones institucionales', /** Verifica el caso «crear, editar y consultar oficina y proteger denominaciones institucionales»; una aserción fallida invalida este resultado. */ async () => {
            const res = await call('/api/oficinas', 'POST', { nombre: `Oficina QA ${sufijo}` });
            assert.equal(res.status, 201);
            oficinaCreada = res.body.registro;
            assert.equal((await call('/api/oficinas', 'POST', { nombre: ` oficina   qa ${sufijo} ` })).status, 409);
            assert.equal((await call(`/api/oficinas/${oficinaCreada.id}`, 'PUT', { nombre: `Oficina editada ${sufijo}` })).status, 200);
            assert.equal((await call(`/api/oficinas/${oficinaCreada.id}`)).body.usuarios.length, 0);
            const direccion = oficinas.find(/** Selecciona las entradas de oficinas que cumplen el criterio requerido por la comprobación. */ /** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ o => o.nombre === 'Dirección');
            assert.equal((await call(`/api/oficinas/${direccion.id}`, 'PUT', { nombre: 'Otro nombre' })).status, 409);
        });
        await t.test('rechazar asignaciones incompatibles, contraseña corta y campos internos', /** Verifica el caso «rechazar asignaciones incompatibles, contraseña corta y campos internos»; una aserción fallida invalida este resultado. */ async () => {
            const usuarioRol = roles.find(/** Selecciona las entradas de roles que cumplen el criterio requerido por la comprobación. */ /** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ r => r.nombre === 'Usuario');
            for (const cuerpo of [
                { ...usuarioDatos(usuarioRol.id, null), contrasena: secreto },
                { ...usuarioDatos(roles.find(/** Selecciona las entradas de roles que cumplen el criterio requerido por la comprobación. */ /** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ r => r.nombre === 'Director(a)').id, oficinaCreada.id), contrasena: secreto },
                { ...usuarioDatos(roles.find(/** Selecciona las entradas de roles que cumplen el criterio requerido por la comprobación. */ /** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ r => r.nombre === 'Secretaria de Dirección').id, oficinaCreada.id), contrasena: secreto },
                { ...usuarioDatos(usuarioRol.id, oficinaCreada.id), contrasena: 'corta' },
                { ...usuarioDatos(usuarioRol.id, oficinaCreada.id), contrasena: secreto, version_autenticacion: 999 },
            ])
                assert.equal((await call('/api/usuarios', 'POST', cuerpo)).status, 400);
        });
        await t.test('crear usuario, no exponer hash, filtrar y consultar asociaciones reales', /** Verifica el caso «crear usuario, no exponer hash, filtrar y consultar asociaciones reales»; una aserción fallida invalida este resultado. */ async () => {
            const res = await call('/api/usuarios', 'POST', { ...usuarioDatos(rolCreado.id, oficinaCreada.id), contrasena: secreto });
            assert.equal(res.status, 201);
            cuenta = res.body.usuario;
            assert.equal('contrasena_hash' in cuenta, false);
            assert.equal('version_autenticacion' in cuenta, false);
            const lista = await call(`/api/usuarios?q=${encodeURIComponent(cuenta.nombre_usuario)}&rol_id=${rolCreado.id}&oficina_id=${oficinaCreada.id}&activo=true`);
            assert.equal(lista.status, 200);
            assert.equal(lista.body.total, 1);
            assert.equal(lista.body.usuarios[0].id, cuenta.id);
            assert.equal((await call(`/api/usuarios?q=${encodeURIComponent("%' OR 1=1 --")}`)).body.total, 0);
            assert.equal((await call('/api/usuarios?pagina=99999')).body.usuarios.length, 0);
            const asociados = await call(`/api/oficinas/${oficinaCreada.id}`);
            assert.equal(asociados.body.usuarios.length, 1);
        });
        await t.test('duplicados de cuenta/correo, edición personal y asignaciones válidas', /** Verifica el caso «duplicados de cuenta/correo, edición personal y asignaciones válidas»; una aserción fallida invalida este resultado. */ async () => {
            assert.equal((await call('/api/usuarios', 'POST', { ...usuarioDatos(rolCreado.id, oficinaCreada.id), contrasena: secreto })).status, 409);
            assert.equal((await call('/api/usuarios', 'POST', { ...usuarioDatos(rolCreado.id, oficinaCreada.id), nombre_usuario: `otro_${sufijo}`, email: cuenta.email.toUpperCase(), contrasena: secreto })).status, 409);
            const datos = { ...usuarioDatos(roles.find(/** Selecciona las entradas de roles que cumplen el criterio requerido por la comprobación. */ /** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ r => r.nombre === 'Director(a)').id, oficinas.find(/** Selecciona las entradas de oficinas que cumplen el criterio requerido por la comprobación. */ /** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ o => o.nombre === 'Dirección').id), nombre: 'Nombre editado', telefono: '555000' };
            assert.equal((await call(`/api/usuarios/${cuenta.id}`, 'PUT', datos)).status, 200);
            const secretaria = { ...datos, rol_id: roles.find(/** Selecciona las entradas de roles que cumplen el criterio requerido por la comprobación. */ /** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ r => r.nombre === 'Secretaria de Dirección').id, oficina_id: oficinas.find(/** Selecciona las entradas de oficinas que cumplen el criterio requerido por la comprobación. */ /** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ o => o.nombre === 'Mesa de Partes').id };
            assert.equal((await call(`/api/usuarios/${cuenta.id}`, 'PUT', secretaria)).status, 200);
        });
        await t.test('usuario ordinario no administra ninguno de los tres módulos', /** Verifica el caso «usuario ordinario no administra ninguno de los tres módulos»; una aserción fallida invalida este resultado. */ async () => {
            const login = await call('/api/auth/login', 'POST', { identificador: cuenta.nombre_usuario, contrasena: secreto }, '');
            assert.equal(login.status, 200);
            for (const ruta of ['/api/roles', '/api/oficinas', '/api/usuarios']) {
                assert.equal((await call(ruta, 'GET', undefined, login.body.token)).status, 403);
                assert.equal((await call(ruta, 'POST', { nombre: 'No autorizado' }, login.body.token)).status, 403);
            }
        });
        await t.test('desactivar conserva fila, invalida JWT e impide login; activar no revive el token anterior', /** Verifica el caso «desactivar conserva fila, invalida JWT e impide login; activar no revive el token anterior»; una aserción fallida invalida este resultado. */ async () => {
            const login = await call('/api/auth/login', 'POST', { identificador: cuenta.nombre_usuario, contrasena: secreto }, '');
            const antiguo = login.body.token;
            assert.equal((await call(`/api/usuarios/${cuenta.id}/estado`, 'PATCH', { activo: false })).status, 200);
            assert.equal((await call('/api/auth/me', 'GET', undefined, antiguo)).status, 401);
            assert.equal((await call('/api/auth/login', 'POST', { identificador: cuenta.nombre_usuario, contrasena: secreto }, '')).status, 401);
            assert.equal((await call(`/api/usuarios/${cuenta.id}`)).body.usuario.activo, false);
            assert.equal((await call(`/api/usuarios/${cuenta.id}/estado`, 'PATCH', { activo: true })).status, 200);
            assert.equal((await call('/api/auth/me', 'GET', undefined, antiguo)).status, 401);
        });
        await t.test('restablecer contraseña invalida sesiones anteriores y permite la contraseña nueva', /** Verifica el caso «restablecer contraseña invalida sesiones anteriores y permite la contraseña nueva»; una aserción fallida invalida este resultado. */ async () => {
            const login = await call('/api/auth/login', 'POST', { identificador: cuenta.nombre_usuario, contrasena: secreto }, '');
            assert.equal((await call(`/api/usuarios/${cuenta.id}/contrasena`, 'PUT', { contrasena: `${secreto}-nueva` })).status, 200);
            assert.equal((await call('/api/auth/me', 'GET', undefined, login.body.token)).status, 401);
            assert.equal((await call('/api/auth/login', 'POST', { identificador: cuenta.nombre_usuario, contrasena: secreto }, '')).status, 401);
            assert.equal((await call('/api/auth/login', 'POST', { identificador: cuenta.nombre_usuario, contrasena: `${secreto}-nueva` }, '')).status, 200);
        });
        await t.test('auditoría identifica al actor y nunca contiene hashes o contraseña literal', /** Verifica el caso «auditoría identifica al actor y nunca contiene hashes o contraseña literal»; una aserción fallida invalida este resultado. */ async () => {
            const rows = (await sandbox.cliente.query(`SELECT usuario_actor_id::text,campos_modificados FROM historial_modificaciones
        WHERE tabla='usuarios' AND registro_id=$1::bigint`, [cuenta.id])).rows;
            assert.ok(rows.length >= 4);
            assert.ok(rows.every(/** Exige que todas las filas cumplan el alcance del escenario «auditoría identifica al actor y nunca contiene hashes o contraseña literal». */  row => row.usuario_actor_id === adminQa.id));
            assert.equal(JSON.stringify(rows).includes(secreto), false);
            assert.equal(JSON.stringify(rows).includes('contrasena_hash'), false);
            assert.ok(rows.some(/** Selecciona las entradas de rows que cumplen el criterio requerido por la comprobación. */ /** Extrae del resultado de la operación los valores que contrastan las aserciones del escenario QA. */ row => row.campos_modificados.contrasena?.modificada));
        });
    }
    finally {
        await sandbox.cerrar();
    }
});
