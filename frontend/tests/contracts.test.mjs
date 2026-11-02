import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'vite';
// Compila únicamente los módulos de contrato en memoria. No genera pantallas ni archivos de ejemplo.
/** Compila el módulo real en memoria mediante Vite y lo importa para verificar contratos sin servidor ni credenciales reales. */
async function importarModulo(entry) {
    const result = await build({
        configFile: false,
        logLevel: 'silent',
        build: { write: false, minify: false, lib: { entry, formats: ['es'] } },
    });
    const outputs = (Array.isArray(result) ? result : [result]).flatMap(/** Transforma cada entrada de (Array.isArray(result) ? result : [result]) para construir los datos que comprueba este escenario. */ /** Reúne los archivos emitidos por Vite tanto si devolvió un resultado único como si generó varios. */ item => item.output);
    const chunk = outputs.find(/** Selecciona las entradas de outputs que cumplen el criterio requerido por la comprobación. */ /** Identifica el chunk JavaScript de entrada entre los archivos generados por Vite para inspeccionar el código real. */ item => item.type === 'chunk' && item.isEntry);
    assert.ok(chunk);
    return import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
}
const auth = await importarModulo('src/features/auth/api/auth.api.ts');
const { apiRequest } = await importarModulo('src/api/client.ts');
const { z } = await import('zod');
test('Contratos y errores HTTP del frontend sin servidor ni credenciales reales', /** Verifica el caso «Contratos y errores HTTP del frontend sin servidor ni credenciales reales»; una aserción fallida invalida este resultado. */ async (t) => {
    const originalFetch = globalThis.fetch;
    const usuario = { id: '9007199254740993', nombre: 'Prueba', apellido: 'Local', nombre_usuario: 'prueba', email: null, rol: 'Prueba', oficina: null, oficina_id:null, ambito_id:null };
    const respuesta = { token: 'token-fixture', tipo: 'Bearer', expiresIn: 900, usuario };
    let peticion;
    /** Prepara una respuesta Fetch controlada y captura la petición para contrastar método, cabeceras y cuerpo. */
    const responder = (body, status = 200) => {
        globalThis.fetch = /** Sustituye Fetch por la respuesta controlada y captura la petición del caso, sin utilizar red ni credenciales reales. */
            async (ruta, opciones) => {
                peticion = { ruta, opciones };
                return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
            };
    };
    try {
        await t.test('login envía nombres exactos y valida bigint como texto', /** Verifica el caso «login envía nombres exactos y valida bigint como texto»; una aserción fallida invalida este resultado. */ async () => {
            responder(respuesta);
            assert.deepEqual(await auth.iniciarSesion({ identificador: 'prueba', contrasena: 'literal ' }), respuesta);
            assert.equal(peticion.ruta, '/api/auth/login');
            assert.equal(peticion.opciones.method, 'POST');
            assert.deepEqual(JSON.parse(peticion.opciones.body), { identificador: 'prueba', contrasena: 'literal ' });
            assert.equal(peticion.opciones.headers.get('content-type'), 'application/json');
        });
        await t.test('/me envía Bearer y valida usuario', /** Verifica el caso «/me envía Bearer y valida usuario»; una aserción fallida invalida este resultado. */ async () => {
            responder({ usuario });
            assert.deepEqual(await auth.obtenerMiUsuario('jwt-fixture'), { usuario });
            assert.equal(peticion.ruta, '/api/auth/me');
            assert.equal(peticion.opciones.headers.get('authorization'), 'Bearer jwt-fixture');
        });
        await t.test('rechaza 2xx con contratos incompatibles', /** Verifica el caso «rechaza 2xx con contratos incompatibles»; una aserción fallida invalida este resultado. */ async () => {
            for (const body of [{}, { ...respuesta, expiresIn: -1 }, { ...respuesta, tipo: 'Otro' }, { ...respuesta, usuario: { ...usuario, id: 123 } }, { ...respuesta, usuario: { ...usuario, rol: {} } }]) {
                responder(body);
                await assert.rejects(auth.iniciarSesion({ identificador: 'x', contrasena: 'x' }), /** Comprueba que el error capturado coincida con el estado o código esperado por el caso. */  error => error.status === 200);
            }
        });
        await t.test('rechaza JSON vacío o malformado', /** Verifica el caso «rechaza JSON vacío o malformado»; una aserción fallida invalida este resultado. */ async () => {
            for (const body of ['', '<html>error</html>']) {
                responder(body);
                await assert.rejects(auth.obtenerMiUsuario('x'), /respuesta inválida/);
            }
        });
        await t.test('conserva códigos 400/401/403/413/429/500 aunque el cuerpo sea HTML', /** Verifica el caso «conserva códigos 400/401/403/413/429/500 aunque el cuerpo sea HTML»; una aserción fallida invalida este resultado. */ async () => {
            for (const status of [400, 401, 403, 413, 429, 500]) {
                responder('<html>error privado</html>', status);
                await assert.rejects(auth.obtenerMiUsuario('x'), /** Comprueba que el error capturado coincida con el estado o código esperado por el caso. */  error => error.status === status && !error.message.includes('privado'));
            }
        });
        await t.test('explica límite de intentos y errores de conexión/lectura', /** Verifica el caso «explica límite de intentos y errores de conexión/lectura»; una aserción fallida invalida este resultado. */ async () => {
            responder({}, 429);
            await assert.rejects(auth.obtenerMiUsuario('x'), /Demasiados intentos/);
            globalThis.fetch = /** Simula un fallo de transporte con detalle privado para comprobar que el cliente devuelve un mensaje seguro. */
                async () => {
                    throw new Error('detalle privado');
                };
            await assert.rejects(auth.obtenerMiUsuario('x'), /** Comprueba que el error capturado coincida con el estado o código esperado por el caso. */  error => error.status === 0);
            globalThis.fetch = /** Simula un fallo de transporte con detalle privado para comprobar que el cliente devuelve un mensaje seguro. */
                async () => ({
                    /** Simula una interrupción al leer el cuerpo para comprobar el error de transporte público. */
                    text: async () => {
                        throw new Error('stream interrumpido');
                    }
                });
            await assert.rejects(auth.obtenerMiUsuario('x'), /** Comprueba que el error capturado coincida con el estado o código esperado por el caso. */  error => error.status === 0);
        });
        await t.test('combina Headers sin perder cabeceras del llamador', /** Verifica el caso «combina Headers sin perder cabeceras del llamador»; una aserción fallida invalida este resultado. */ async () => {
            responder({ ok: true });
            await apiRequest('/api/health', z.object({ ok: z.boolean() }), { headers: new Headers({ 'X-Prueba': 'valor' }) });
            assert.equal(peticion.opciones.headers.get('x-prueba'), 'valor');
            assert.equal(peticion.opciones.headers.get('accept'), 'application/json');
        });
    }
    finally {
        globalThis.fetch = originalFetch;
    }
});
