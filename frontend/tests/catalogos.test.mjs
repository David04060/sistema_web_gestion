import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { build } from 'vite';
// Contratos de los mÃ³dulos compilados en memoria; estas regresiones no escriben en PostgreSQL.
const resultado = await build({
    configFile: false, logLevel: 'silent',
    plugins: [{
            name: 'catalogos-contract-entry',
            /** Reconoce el identificador virtual que permite compilar contratos reales en memoria para estas pruebas. */
            resolveId(id) {
                if (id === 'virtual:catalogos-contracts')
                    return '\0virtual:catalogos-contracts';
            },
            /** Construye las exportaciones virtuales desde los módulos reales; evita mantener copias de sus implementaciones en las pruebas. */
            load(id) {
                if (id !== '\0virtual:catalogos-contracts')
                    return;
                /** Convierte la ruta local en un literal de importación portátil para el módulo virtual de pruebas. */
                const path = file => JSON.stringify(resolve(file).replaceAll('\\', '/'));
                return `
        export * from ${path('src/features/tipos-documentales/schemas/tipos.schema.ts')};
        export * from ${path('src/features/ubicaciones/schemas/ubicaciones.schema.ts')};
        export * as tiposApi from ${path('src/features/tipos-documentales/api/tipos.api.ts')};
        export * as ubicacionesApi from ${path('src/features/ubicaciones/api/ubicaciones.api.ts')};
      `;
            },
        }],
    build: { write: false, minify: false, rollupOptions: { input: 'virtual:catalogos-contracts', preserveEntrySignatures: 'strict', output: { format: 'es', codeSplitting: false } } },
});
const chunk = (Array.isArray(resultado) ? resultado : [resultado]).flatMap(/** Transforma cada entrada de (Array.isArray(resultado) ? resultado : [resultado]) para construir los datos que comprueba este escenario. */ /** Reúne los archivos emitidos por Vite tanto si devolvió un resultado único como si generó varios. */ item => item.output).find(/** Selecciona las entradas de (Array.isArray(resultado) ? resultado : [resultado]).flatMap(item => item.output) que cumplen el criterio requerido por la comprobación. */ /** Identifica el chunk JavaScript de entrada entre los archivos generados por Vite para inspeccionar el código real. */ item => item.type === 'chunk' && item.isEntry);
const { formularioTipoSchema, estanteDatosSchema, archivadorDatosSchema, opcionesSchema, tiposApi, ubicacionesApi } = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
const fechas = { fecha_creacion: '2026-10-21T12:00:00Z', fecha_modificacion: '2026-10-21T12:00:00Z' };
const tipo = { id: '1', nombre: 'Informe', prefijo_codigo: 'INF', requiere_clave: false, prefijo_protegido: false, ...fechas };
const estante = { id: '1', codigo: 'A', usuario_id: '1', oficina_id: '1', oficina: 'Dirección', responsable: 'Cuenta QA', responsable_activo: true, ...fechas };
const archivador = { id: '1', estante_id: '1', numero: 1, codigo: 'A', usuario_id: '1', oficina_id: '1', oficina: 'Dirección', responsable: 'Cuenta QA', ...fechas };
/** Sustituye temporalmente Fetch con la respuesta del caso y restaura el transporte original después de ejecutar sus aserciones. */
async function respuesta(body, fn, status = 200) {
    const original = globalThis.fetch;
    let request;
    globalThis.fetch = /** Sustituye Fetch por la respuesta controlada y captura la petición del caso, sin utilizar red ni credenciales reales. */
        async (ruta, opciones) => {
            request = { ruta, opciones };
            return new Response(JSON.stringify(body), { status });
        };
    try {
        await fn(/** Devuelve la petición capturada al caso sin exponer la función Fetch sustituida. */ () => request);
    }
    finally {
        globalThis.fetch = original;
    }
}
test('Tipos: nombre y prefijo se normalizan; el vacío permanece sin prefijo', /** Verifica el caso «Tipos: nombre y prefijo se normalizan; el vacío permanece sin prefijo»; una aserción fallida invalida este resultado. */ () => {
    assert.deepEqual(formularioTipoSchema.parse({ nombre: ' Tipo   nuevo ', prefijo_codigo: 'inf' }), { nombre: 'Tipo nuevo', prefijo_codigo: 'INF' });
    assert.equal(formularioTipoSchema.parse({ nombre: 'Tipo', prefijo_codigo: '' }).prefijo_codigo, null);
    assert.equal(formularioTipoSchema.safeParse({ nombre: 'Tipo', prefijo_codigo: '123' }).success, false);
});
test('Ubicaciones: límites SQL, número positivo y campos internos rechazados', /** Verifica el caso «Ubicaciones: límites SQL, número positivo y campos internos rechazados»; una aserción fallida invalida este resultado. */ () => {
    assert.equal(estanteDatosSchema.parse({ codigo: ' a ', usuario_id: '1', oficina_id: '1' }).codigo, 'A');
    assert.equal(estanteDatosSchema.safeParse({ codigo: 'A1', usuario_id: '1', oficina_id: '1' }).success, false);
    assert.equal(archivadorDatosSchema.safeParse({ numero: 0, estante_id: '1' }).success, false);
    assert.equal(archivadorDatosSchema.safeParse({ numero: 1, estante_id: '1', usuario_id: '2' }).success, false);
    assert.equal(opcionesSchema.safeParse({ actor_id: '1', administrador: false, oficina_id: null, oficinas: [], responsables: [] }).success, true);
});
test('API tipos: Bearer, POST/PUT y protección del contrato de respuesta', /** Verifica el caso «API tipos: Bearer, POST/PUT y protección del contrato de respuesta»; una aserción fallida invalida este resultado. */ async () => {
    await respuesta({ tipo }, /** Comprueba el contrato y la petición capturada del escenario «API tipos: Bearer, POST/PUT y protección del contrato de respuesta» utilizando la respuesta HTTP simulada. */ async (get) => {
        await tiposApi.guardar('jwt', { nombre: 'Informe', prefijo_codigo: 'INF' });
        assert.equal(get().ruta, '/api/tipos-documentales');
        assert.equal(get().opciones.method, 'POST');
        assert.equal(get().opciones.headers.get('Authorization'), 'Bearer jwt');
    });
    await respuesta({ tipo }, /** Comprueba el contrato y la petición capturada del escenario «API tipos: Bearer, POST/PUT y protección del contrato de respuesta» utilizando la respuesta HTTP simulada. */ async (get) => {
        await tiposApi.guardar('jwt', { nombre: 'Informe', prefijo_codigo: 'INF' }, '1');
        assert.equal(get().opciones.method, 'PUT');
        assert.equal(get().ruta, '/api/tipos-documentales/1');
    });
    await respuesta({ tipo: { ...tipo, fecha_creacion: 'incorrecta' } }, /** Comprueba el contrato y la petición capturada del escenario «API tipos: Bearer, POST/PUT y protección del contrato de respuesta» utilizando la respuesta HTTP simulada. */ async () => assert.rejects(/** Ejecuta la operación del caso «API tipos: Bearer, POST/PUT y protección del contrato de respuesta» para comprobar su rechazo o excepción esperada. */ () => tiposApi.detalle('jwt', '1')));
});
test('API ubicaciones: endpoints reales, filtros de respuesta y asociación conservada', /** Verifica el caso «API ubicaciones: endpoints reales, filtros de respuesta y asociación conservada»; una aserción fallida invalida este resultado. */ async () => {
    await respuesta({ estante }, /** Comprueba el contrato y la petición capturada del escenario «API ubicaciones: endpoints reales, filtros de respuesta y asociación conservada» utilizando la respuesta HTTP simulada. */ async (get) => {
        await ubicacionesApi.guardarEstante('jwt', { codigo: 'A', usuario_id: '1', oficina_id: '1' });
        assert.equal(get().ruta, '/api/ubicaciones/estantes');
        assert.deepEqual(JSON.parse(get().opciones.body), { codigo: 'A', usuario_id: '1', oficina_id: '1' });
    });
    await respuesta({ archivador }, /** Comprueba el contrato y la petición capturada del escenario «API ubicaciones: endpoints reales, filtros de respuesta y asociación conservada» utilizando la respuesta HTTP simulada. */ async (get) => {
        await ubicacionesApi.guardarArchivador('jwt', { estante_id: '1', numero: 1 }, '1');
        assert.equal(get().opciones.method, 'PUT');
        assert.equal(get().ruta, '/api/ubicaciones/archivadores/1');
    });
    await respuesta({ estante, archivadores: [archivador] }, /** Comprueba el contrato y la petición capturada del escenario «API ubicaciones: endpoints reales, filtros de respuesta y asociación conservada» utilizando la respuesta HTTP simulada. */ async () => assert.equal((await ubicacionesApi.estante('jwt', '1')).archivadores.length, 1));
});
