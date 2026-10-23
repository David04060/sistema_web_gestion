import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guardarTipoSchema } from '../dist/modules/tipos-documentales/tipos-documentales.schema.js';
import { estanteSchema, archivadorSchema } from '../dist/modules/ubicaciones/ubicaciones.schema.js';
test('Tipos: normaliza nombre y prefijo, rechaza campos de seguridad', /** Verifica el caso «Tipos: normaliza nombre y prefijo, rechaza campos de seguridad»; una aserción fallida invalida este resultado. */ () => {
    assert.deepEqual(guardarTipoSchema.parse({ nombre: ' Tipo   nuevo ', prefijo_codigo: 'abc' }), { nombre: 'Tipo nuevo', prefijo_codigo: 'ABC' });
    assert.equal(guardarTipoSchema.safeParse({ nombre: 'Tipo', prefijo_codigo: null, requiere_clave: true }).success, false);
    assert.equal(guardarTipoSchema.safeParse({ nombre: 'Tipo', prefijo_codigo: '1' }).success, false);
});
test('Ubicaciones: restricciones reales y bigint sin pérdida de precisión', /** Verifica el caso «Ubicaciones: restricciones reales y bigint sin pérdida de precisión»; una aserción fallida invalida este resultado. */ () => {
    assert.equal(estanteSchema.parse({ codigo: ' ab ', usuario_id: '1', oficina_id: '1' }).codigo, 'AB');
    assert.equal(estanteSchema.safeParse({ codigo: 'A1', usuario_id: '1', oficina_id: '1' }).success, false);
    assert.equal(estanteSchema.safeParse({ codigo: 'A', usuario_id: '9223372036854775808', oficina_id: '1' }).success, false);
    assert.equal(archivadorSchema.safeParse({ estante_id: '1', numero: 0 }).success, false);
    assert.equal(archivadorSchema.safeParse({ estante_id: '1', numero: 2147483648 }).success, false);
});
