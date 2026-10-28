import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
const resultado = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, lib: { entry: 'src/features/siseve/api/siseve.api.ts', formats: ['es'] } } });
const output = (Array.isArray(resultado) ? resultado : [resultado]).flatMap(/** Transforma cada entrada de (Array.isArray(resultado)?resultado:[resultado]) para construir los datos que comprueba este escenario. */ /** Reúne los archivos emitidos por Vite tanto si devolvió un resultado único como si generó varios. */ r => r.output);
const chunk = output.find(/** Selecciona las entradas de output que cumplen el criterio requerido por la comprobación. */ /** Identifica el chunk JavaScript de entrada entre los archivos generados por Vite para inspeccionar el código real. */ c => c.type === 'chunk' && c.isEntry);
const api = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
test('Siseve transmite cada clave en body y valida el resultado sin generar desbloqueo', /** Verifica el caso «Siseve transmite cada clave en body y valida el resultado sin generar desbloqueo»; una aserción fallida invalida este resultado. */ async () => {
    const anterior = globalThis.fetch;
    const peticiones = [];
    globalThis.fetch = /** Sustituye Fetch por la respuesta controlada y captura la petición del caso, sin utilizar red ni credenciales reales. */
        async (ruta, opciones) => {
            peticiones.push({ ruta, opciones });
            return new Response(JSON.stringify({ resultado: { oficinas: [], tipos: [], destinatarios: [], archivadores: [], filtros: [], puede_registrar: true } }), { status: 200 });
        };
    try {
        await api.operar('jwt-qa', 'Primera clave literal ', 'opciones', {});
        await api.operar('jwt-qa', 'Segunda clave', 'opciones', {});
        assert.equal(peticiones.length, 2);
        for (const p of peticiones) {
            assert.equal(p.ruta, '/api/siseve/operaciones');
            assert.equal(p.opciones.method, 'POST');
            assert.equal(p.opciones.headers.get('Authorization'), 'Bearer jwt-qa');
            assert.equal(p.ruta.includes('clave'), false);
        }
        assert.equal(JSON.parse(peticiones[0].opciones.body).clave, 'Primera clave literal ');
        assert.equal(JSON.parse(peticiones[1].opciones.body).clave, 'Segunda clave');
    }
    finally {
        globalThis.fetch = anterior;
    }
});
test('Siseve no acepta respuestas de contenido incompatibles y propaga un 403 sin conceder acceso', /** Verifica el caso «Siseve no acepta respuestas de contenido incompatibles y propaga un 403 sin conceder acceso»; una aserción fallida invalida este resultado. */ async () => {
    const anterior = globalThis.fetch;
    try {
        globalThis.fetch = /** Sustituye Fetch por la respuesta controlada y captura la petición del caso, sin utilizar red ni credenciales reales. */
            async () => new Response(JSON.stringify({ resultado: { token: 'No es un resultado documental' } }));
        await assert.rejects(api.operar('jwt', 'clave', 'detalle', {}, '1'));
        globalThis.fetch = /** Sustituye Fetch por la respuesta controlada y captura la petición del caso, sin utilizar red ni credenciales reales. */
            async () => new Response(JSON.stringify({ error: 'No se pudo autorizar la operacion restringida' }), { status: 403 });
        await assert.rejects(api.operar('jwt', 'clave', 'detalle', {}, '1'), /** Comprueba que el error capturado coincida con el estado o código esperado por el caso. */  e => e.status === 403);
    }
    finally {
        globalThis.fetch = anterior;
    }
});
test('Administracion de Siseve usa contratos de permisos y clave separados, solo en body', /** Verifica el caso «Administracion de Siseve usa contratos de permisos y clave separados, solo en body»; una aserción fallida invalida este resultado. */ async () => {
    const anterior = globalThis.fetch;
    const peticiones = [];
    globalThis.fetch = /** Sustituye Fetch por la respuesta controlada y captura la petición del caso, sin utilizar red ni credenciales reales. */
        async (ruta, opciones) => {
            peticiones.push({ ruta, opciones });
            return new Response(JSON.stringify({ configuracion: { id: '1', prefijo_codigo: 'SISEVE', clave_configurada: true }, usuarios: [] }));
        };
    try {
        await api.autorizar('jwt-admin', '42', false);
        await api.cambiarClave('jwt-admin', 'Clave de prueba literal ');
        assert.equal(peticiones[0].ruta, '/api/siseve/autorizaciones');
        assert.equal(peticiones[0].opciones.method, 'PUT');
        assert.deepEqual(JSON.parse(peticiones[0].opciones.body), { usuario_id: '42', activo: false });
        assert.equal(peticiones[1].ruta, '/api/siseve/clave');
        assert.deepEqual(JSON.parse(peticiones[1].opciones.body), { contrasena: 'Clave de prueba literal ' });
    }
    finally {
        globalThis.fetch = anterior;
    }
});
