import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';

const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: 'src/features/documentos/api/documentos.api.ts', formats: ['es'] } } });
const chunk = (Array.isArray(result) ? result[0] : result).output.find(c => c.type === 'chunk' && c.isEntry);
const api = await import('data:text/javascript;base64,' + Buffer.from(chunk.code).toString('base64'));

test('Selección operativa usa endpoint independiente y conserva IDs bigint como texto', async () => {
    const original = globalThis.fetch, calls = [], id = '9007199254740993';
    globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        return new Response(JSON.stringify({ archivos: [{ id, nombre: 'Archivo institucional', responsabilidad: 'Actas', oficina_id: id, oficina: 'Oficina' }] }));
    };
    try {
        const r = await api.archivosDisponibles('jwt-qa');
        assert.equal(r.archivos[0].id, id);
        assert.ok(calls[0].url.endsWith('/api/documentos/archivos-disponibles'));
        assert.equal(calls[0].options.headers.get('Authorization'), 'Bearer jwt-qa');
    } finally { globalThis.fetch = original; }
});
