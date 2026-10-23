import assert from 'node:assert/strict';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
// Aislamiento explícito: no se cargan credenciales ni se conecta a PostgreSQL.
process.env.DATABASE_URL = 'postgresql://fixture:fixture@127.0.0.1:1/fixture';
process.env.JWT_SECRET = 'secreto-exclusivo-de-pruebas-locales-000000';
const { app } = await import('../dist/app.js');
const { pool } = await import('../dist/config/database.js');
const { generarHash, verificarContrasena } = await import('../dist/shared/security/password.js');
const { generarToken, verificarToken } = await import('../dist/shared/security/jwt.js');
const { requiereRol } = await import('../dist/middlewares/roles.middleware.js');
test('Regresiones de autenticación, criptografía y HTTP con repositorio simulado', /** Verifica el caso «Regresiones de autenticación, criptografía y HTTP con repositorio simulado»; una aserción fallida invalida este resultado. */ async (t) => {
    const hash = await generarHash('Clave-local-123');
    const usuario = {
        id: '9007199254740993', nombre: 'Prueba', apellido: 'Local', nombre_usuario: 'prueba',
        email: null, contrasena_hash: hash, activo: true, rol: 'Prueba', oficina: null, version_autenticacion: 0,
    };
    let registro = usuario;
    const consultas = [];
    const queryOriginal = pool.query;
    pool.query = /** Sustituye el repositorio por consultas controladas del caso para comprobar contratos sin escrituras reales. */
        async (sql, parametros) => {
            consultas.push({ sql, parametros });
            return { rows: registro ? [registro] : [] };
        };
    const servidor = app.listen(0, '127.0.0.1');
    await new Promise(/** Enlaza la finalización asíncrona del recurso o respuesta controlada con la promesa que espera la prueba. */  resolve => servidor.once('listening', resolve));
    const base = `http://127.0.0.1:${servidor.address().port}`;
    /** Envía una petición al servidor local de pruebas con el contrato y las credenciales efímeras del escenario. */
    const request = (path, opciones = {}) => fetch(base + path, opciones);
    /** Envía o simula el login del escenario de pruebas según el adaptador local; no utiliza cuentas institucionales reales. */
    const login = body => request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    /** Firma un JWT controlado con las opciones del caso para probar el rechazo de tokens incompatibles. */
    const sign = (payload, opciones = {}) => jwt.sign(payload, process.env.JWT_SECRET, {
        issuer: 'sistema-web-documental', audience: 'sistema-web-documental-api', algorithm: 'HS256', ...opciones,
    });
    try {
        await t.test('scrypt: acepta contraseña correcta y rechaza incorrecta/hash malformado', /** Verifica el caso «scrypt: acepta contraseña correcta y rechaza incorrecta/hash malformado»; una aserción fallida invalida este resultado. */ async () => {
            assert.equal(await verificarContrasena('Clave-local-123', hash), true);
            assert.equal(await verificarContrasena('incorrecta', hash), false);
            for (const invalido of ['', 'scrypt$1$8$1$00$00', hash.replace('16384', '32768')]) {
                assert.equal(await verificarContrasena('Clave-local-123', invalido), false);
            }
            assert.notEqual(hash, await generarHash('Clave-local-123'));
            await assert.rejects(generarHash('corta'));
        });
        await t.test('JWT: roundtrip conserva bigint y versión', /** Verifica el caso «JWT: roundtrip conserva bigint y versión»; una aserción fallida invalida este resultado. */ () => {
            const token = generarToken(usuario.id, 0);
            assert.deepEqual(verificarToken(token), { sub: usuario.id, version: 0 });
            const payload = jwt.decode(token);
            assert.equal(payload.exp - payload.iat, 900);
        });
        await t.test('JWT: rechaza ausencia de exp, expiración, algoritmo, audiencia, versión e ID inválidos', /** Verifica el caso «JWT: rechaza ausencia de exp, expiración, algoritmo, audiencia, versión e ID inválidos»; una aserción fallida invalida este resultado. */ () => {
            const invalidos = [
                sign({ sub: '1', version: 0 }),
                sign({ sub: '1', version: 0 }, { expiresIn: -20 }),
                sign({ sub: '1', version: 0 }, { expiresIn: 900, audience: 'otro' }),
                sign({ sub: '1', version: 0 }, { expiresIn: 900, issuer: 'otro' }),
                jwt.sign({ sub: '1', version: 0 }, 'otro-secreto', { expiresIn: 900 }),
                sign({ sub: '1', version: 0 }, { expiresIn: 900, algorithm: 'HS384' }),
                sign({ sub: '9223372036854775808', version: 0 }, { expiresIn: 900 }),
                sign({ sub: '1', version: -1 }, { expiresIn: 900 }),
                sign({ sub: '0', version: 0 }, { expiresIn: 900 }),
                'invalido',
            ];
            for (const token of invalidos)
                assert.throws(/** Ejecuta la operación del caso «JWT: rechaza ausencia de exp, expiración, algoritmo, audiencia, versión e ID inválidos» para comprobar su rechazo o excepción esperada. */ () => verificarToken(token));
        });
        await t.test('health/404 y encabezados de seguridad', /** Verifica el caso «health/404 y encabezados de seguridad»; una aserción fallida invalida este resultado. */ async () => {
            const res = await request('/api/health');
            assert.equal(res.status, 200);
            assert.deepEqual(await res.json(), { status: 'ok', message: 'Backend funcionando correctamente' });
            assert.equal(res.headers.get('x-powered-by'), null);
            assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
            assert.equal((await request('/api/no-existe')).status, 404);
        });
        await t.test('entrada inválida, campos adicionales y JSON roto devuelven 400', /** Verifica el caso «entrada inválida, campos adicionales y JSON roto devuelven 400»; una aserción fallida invalida este resultado. */ async () => {
            for (const body of [{}, { identificador: 'x', contrasena: 'x', adicional: true }])
                assert.equal((await login(body)).status, 400);
            const res = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
            assert.equal(res.status, 400);
            assert.deepEqual(await res.json(), { error: 'JSON inválido' });
        });
        await t.test('cuerpo mayor a 100 KB devuelve 413, sin exponer contenido', /** Verifica el caso «cuerpo mayor a 100 KB devuelve 413, sin exponer contenido»; una aserción fallida invalida este resultado. */ async () => {
            const res = await login({ identificador: 'x', contrasena: 'x'.repeat(110000) });
            assert.equal(res.status, 413);
            assert.deepEqual(await res.json(), { error: 'La solicitud supera el tamaño permitido' });
        });
        await t.test('codificación JSON no admitida devuelve 415', /** Verifica el caso «codificación JSON no admitida devuelve 415»; una aserción fallida invalida este resultado. */ async () => {
            const res = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json; charset=iso-8859-1' }, body: '{}' });
            assert.equal(res.status, 415);
            assert.deepEqual(await res.json(), { error: 'Codificación de solicitud no admitida' });
        });
        await t.test('login válido mantiene contrato y omite información privada', /** Verifica el caso «login válido mantiene contrato y omite información privada»; una aserción fallida invalida este resultado. */ async () => {
            const res = await login({ identificador: ' PRUEBA ', contrasena: 'Clave-local-123' });
            assert.equal(res.status, 200);
            assert.equal(res.headers.get('cache-control'), 'no-store');
            const body = await res.json();
            assert.deepEqual(Object.keys(body).sort(), ['expiresIn', 'tipo', 'token', 'usuario']);
            assert.equal(body.tipo, 'Bearer');
            assert.equal(body.expiresIn, 900);
            assert.equal(body.usuario.id, usuario.id);
            assert.equal('contrasena_hash' in body.usuario, false);
            assert.equal('version_autenticacion' in body.usuario, false);
            assert.equal('activo' in body.usuario, false);
            assert.deepEqual(consultas.at(-1).parametros, ['prueba']);
        });
        await t.test('login ausente, inactivo o incorrecto devuelve el mismo 401', /** Verifica el caso «login ausente, inactivo o incorrecto devuelve el mismo 401»; una aserción fallida invalida este resultado. */ async () => {
            for (const fila of [null, { ...usuario, activo: false }, usuario]) {
                registro = fila;
                const res = await login({ identificador: 'prueba', contrasena: 'incorrecta' });
                assert.equal(res.status, 401);
                assert.deepEqual(await res.json(), { error: 'Usuario o contraseña incorrectos' });
            }
            registro = usuario;
        });
        await t.test('identificador SQL permanece en el parámetro y no se interpola', /** Verifica el caso «identificador SQL permanece en el parámetro y no se interpola»; una aserción fallida invalida este resultado. */ async () => {
            await login({ identificador: "x' OR 1=1 --", contrasena: 'incorrecta' });
            assert.equal(consultas.at(-1).sql.includes("x' OR 1=1 --"), false);
            assert.deepEqual(consultas.at(-1).parametros, ["x' or 1=1 --"]);
        });
        await t.test('/me: exige Bearer y no consulta PostgreSQL con token inválido', /** Verifica el caso «/me: exige Bearer y no consulta PostgreSQL con token inválido»; una aserción fallida invalida este resultado. */ async () => {
            const cantidad = consultas.length;
            for (const autorizacion of [null, 'Basic valor', 'Bearer invalido', 'Bearer dos valores']) {
                const res = await request('/api/auth/me', autorizacion ? { headers: { authorization: autorizacion } } : {});
                assert.equal(res.status, 401);
            }
            assert.equal(consultas.length, cantidad);
        });
        await t.test('/me: perfil público, usuario ausente/inactivo y versión revocada', /** Verifica el caso «/me: perfil público, usuario ausente/inactivo y versión revocada»; una aserción fallida invalida este resultado. */ async () => {
            const token = generarToken(usuario.id, 0);
            const opciones = { headers: { authorization: `Bearer ${token}` } };
            const res = await request('/api/auth/me', opciones);
            assert.equal(res.status, 200);
            const body = await res.json();
            assert.equal(body.usuario.id, usuario.id);
            assert.equal('contrasena_hash' in body.usuario, false);
            assert.deepEqual(consultas.at(-1).parametros, [usuario.id]);
            for (const fila of [null, { ...usuario, activo: false }, { ...usuario, version_autenticacion: 1 }]) {
                registro = fila;
                assert.equal((await request('/api/auth/me', opciones)).status, 401);
            }
            registro = usuario;
        });
        await t.test('error de repositorio devuelve 500 genérico sin SQL/credenciales', /** Verifica el caso «error de repositorio devuelve 500 genérico sin SQL/credenciales»; una aserción fallida invalida este resultado. */ async () => {
            pool.query = /** Sustituye el repositorio por consultas controladas del caso para comprobar contratos sin escrituras reales. */
                async () => {
                    throw new Error('SQL y credenciales privadas');
                };
            const res = await request('/api/auth/me', { headers: { authorization: `Bearer ${generarToken(usuario.id, 0)}` } });
            assert.equal(res.status, 500);
            assert.deepEqual(await res.json(), { error: 'Error interno del servidor' });
        });
        await t.test('middleware de roles diferencia 401/403 y permite el autorizado', /** Verifica el caso «middleware de roles diferencia 401/403 y permite el autorizado»; una aserción fallida invalida este resultado. */ () => {
            for (const [u, esperado] of [[undefined, 401], [{ rol: 'Otro' }, 403], [{ rol: 'Prueba' }, 200]]) {
                let status = 200;
                let permitido = false;
                const res = {
                    /** Captura el estado HTTP del middleware y permite encadenar la respuesta simulada. */
                    status(valor) {
                        status = valor;
                        return this;
                    }, 
/** Completa la respuesta simulada del middleware; el caso comprueba el estado sin publicar datos reales. */
                    json() {
                    }
                };
                requiereRol('Prueba')({ usuario: u }, res, /** Marca que el middleware permitió continuar cuando el rol del fixture estaba autorizado. */ () => {
                    permitido = true;
                });
                assert.equal(status, esperado);
                assert.equal(permitido, esperado === 200);
            }
        });
        await t.test('límite de intentos devuelve 429', /** Verifica el caso «límite de intentos devuelve 429»; una aserción fallida invalida este resultado. */ async () => {
            let res;
            for (let i = 0; i < 11; i++)
                res = await login({});
            assert.equal(res.status, 429);
            assert.equal(res.headers.get('cache-control'), 'no-store');
        });
    }
    finally {
        pool.query = queryOriginal;
        await new Promise(/** Enlaza la finalización asíncrona del recurso o respuesta controlada con la promesa que espera la prueba. */  resolve => servidor.close(resolve));
        await pool.end();
    }
});
