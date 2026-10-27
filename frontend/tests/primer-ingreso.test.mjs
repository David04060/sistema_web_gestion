import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'vite';
import { presentacionSchema, ingresoSchema } from '../src/features/ingresos/schemas/ingresos.schema.ts';

const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: 'src/features/ingresos/api/ingresos.api.ts', formats: ['es'] } } });
const chunk = (Array.isArray(result) ? result[0] : result).output.find(c => c.type === 'chunk' && c.isEntry);
const api = await import('data:text/javascript;base64,' + Buffer.from(chunk.code).toString('base64'));
const id = '9007199254740993';
const ingreso = { id, referencia: 'MP-' + id, documento_id: id, registrado_por_id: id, registradora: 'Secretaría QA',
    fecha_ingreso: '2026-10-26T15:00:00Z', fecha_presentacion: '2026-10-26T14:59:00Z', presentante: 'Presentante QA',
    procedencia: 'Institución QA', proposito: 'Primera presentación', movimiento_recepcion_id: id };

test('Primer ingreso distingue referencia, documento y presentación; mantiene bigint textual', () => {
    assert.equal(ingresoSchema.parse(ingreso).documento_id, id);
    assert.equal(presentacionSchema.safeParse({ presentante: 'QA', procedencia: 'QA', proposito: ' ' }).success, false);
    assert.equal(presentacionSchema.safeParse({ presentante: 'QA', procedencia: 'QA', proposito: 'Gestión', concluido_por_id: id }).success, false);
});
test('Recepción coordinada, formalización y alta externa utilizan contratos distintos sin convertir IDs', async () => {
    const original = globalThis.fetch, calls = [];
    globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        return new Response(JSON.stringify({ documento_id: id, ingreso }));
    };
    try {
        const presentacion = { presentante: 'QA', procedencia: 'QA', proposito: 'Gestión' };
        await api.recibirEIngresar('jwt-qa', id, { ...presentacion, archivador_id: null, confirmar_recepcion: true });
        await api.formalizarRecibido('jwt-qa', id, presentacion);
        await api.registrarExterno('jwt-qa', { solicitud_id: '87b26a5d-e53b-460a-9379-803b730e5c25', presentacion });
        assert.ok(calls[0].url.endsWith('/api/ingresos/recepciones/' + id));
        assert.ok(calls[1].url.endsWith('/api/ingresos/recibidos/' + id));
        assert.ok(calls[2].url.endsWith('/api/ingresos/externos'));
        assert.equal(calls[0].options.headers.get('Authorization'), 'Bearer jwt-qa');
        assert.equal(JSON.parse(calls[0].options.body).confirmar_recepcion, true);
        assert.deepEqual(JSON.parse(calls[1].options.body), presentacion);
    } finally { globalThis.fetch = original; }
});
