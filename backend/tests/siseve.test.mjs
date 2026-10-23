import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { ejecutarRestringido, tipoVisibleSQL, clienteDocumental } from '../dist/shared/documental/contexto.js';
import { operacionSchema, claveNuevaSchema } from '../dist/modules/siseve/siseve.schema.js';
test('Siseve exige clave por peticion y contratos que no aceptan privilegios enviados por cliente', /** Verifica el caso «Siseve exige clave por peticion y contratos que no aceptan privilegios enviados por cliente»; una aserción fallida invalida este resultado. */ () => {
    assert.equal(operacionSchema.safeParse({ operacion: 'detalle', id: '1' }).success, false);
    assert.equal(operacionSchema.safeParse({ operacion: 'detalle', id: '1', clave: 'literal', autorizado: true }).success, false);
    assert.equal(operacionSchema.safeParse({ operacion: 'desbloquear', clave: 'literal' }).success, false);
    assert.equal(claveNuevaSchema.safeParse({ contrasena: 'corta' }).success, false);
});
test('El contexto restringido se aisla entre operaciones concurrentes y no sobrevive a su cierre', /** Verifica el caso «El contexto restringido se aisla entre operaciones concurrentes y no sobrevive a su cierre»; una aserción fallida invalida este resultado. */ async () => {
    const normal = tipoVisibleSQL();
    const valoresA = [];
    const valoresB = [];
    const clienteA = {
        /** Captura los parámetros del contexto A para demostrar que no se mezclan con otra operación concurrente. */
        query: async (_sql, valores) => valoresA.push(valores)
    };
    const clienteB = {
        /** Captura los parámetros del contexto B para demostrar su aislamiento asíncrono frente al contexto A. */
        query: async (_sql, valores) => valoresB.push(valores)
    };
    await Promise.all([ejecutarRestringido(clienteA, '1', /** Comprueba que la conexión y el tipo restringido permanezcan aislados durante operaciones asíncronas concurrentes. */ async () => {
            await setTimeout(5);
            assert.match(tipoVisibleSQL(), /app.tipo_restringido_id/);
            assert.deepEqual(valoresA, [['1']]);
            assert.equal(clienteDocumental(), clienteA);
        }), ejecutarRestringido(clienteB, '2', /** Comprueba que la conexión y el tipo restringido permanezcan aislados durante operaciones asíncronas concurrentes. */ async () => {
            await setTimeout(1);
            assert.match(tipoVisibleSQL(), /app.tipo_restringido_id/);
            assert.deepEqual(valoresB, [['2']]);
            assert.equal(clienteDocumental(), clienteB);
        }), setTimeout(2).then(/** Comprueba que una operación ajena a los contextos restringidos conserve el predicado ordinario. */ () => assert.equal(tipoVisibleSQL(), normal))]);
    assert.equal(tipoVisibleSQL(), normal);
    assert.equal(clienteDocumental(), undefined);
    await assert.rejects(ejecutarRestringido(clienteA, '1 OR true', /** Obtiene el predicado restringido dentro del contexto temporal para contrastarlo con el alcance ordinario. */ async () => tipoVisibleSQL()));
});
