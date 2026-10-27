import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { build } from 'vite';
const result = await build({ configFile: false, logLevel: 'silent', plugins: [{
    name: 'archivos-contracts',
    resolveId(id) { if (id === 'virtual:archivos') return '\0archivos'; },
    load(id) {
        if (id !== '\0archivos') return;
        const path = file => JSON.stringify(resolve(file).replaceAll('\\', '/'));
        return `export * from ${path('src/features/archivos/schemas/archivos.schema.ts')};
         export {responsableCompatible} from ${path('src/features/archivos/hooks/useCatalogosArchivos.ts')};
         export * as api from ${path('src/features/archivos/api/archivos.api.ts')};`;
    },
}], build: { write: false, minify: false, rollupOptions: { input: 'virtual:archivos', preserveEntrySignatures: 'strict', output: { format: 'es', codeSplitting: false } } } });
const chunk = result.output.find(c => c.type === 'chunk' && c.isEntry);
const { crearSchema, metadatosSchema, respuestaSchema, responsableCompatible, api } = await import('data:text/javascript;base64,' + Buffer.from(chunk.code).toString('base64'));
const big = '9007199254740993';
const archivo = { id: big, nombre: 'Archivo prueba', responsabilidad: 'Responsabilidad', oficina_id: big,
    oficina: 'Oficina', creado_por_id: big, creador: 'Actor', fecha_creacion: '2026-10-25T12:00:00Z', motivo: 'Registro',
    asignacion_id: big, responsable_id: big, responsable: 'Responsable', fecha_inicio: '2026-10-25T12:00:00Z' };
test('Archivos conserva bigint textual y valida motivos y campos editables', () => {
    assert.equal(respuestaSchema.parse({ archivo }).archivo.id, big);
    assert.equal(crearSchema.parse({ nombre: ' Archivo   estable ', responsabilidad: 'Finalidad', motivo: 'Registro', oficina_id: big, responsable_id: big }).oficina_id, big);
    assert.equal(metadatosSchema.safeParse({ nombre: 'Archivo', responsabilidad: 'Finalidad', motivo: ' ' }).success, false);
    assert.equal(metadatosSchema.safeParse({ nombre: 'Archivo', responsabilidad: 'Finalidad', motivo: 'Correccion', responsable_id: big }).success, false);
});
test('Seleccion de responsables exige actividad y correspondencia institucional', () => {
    const oficina = { id: big, nombre: 'Oficina' };
    const user = { id: big, activo: true, oficina_id: big, rol: 'Usuario' };
    assert.equal(responsableCompatible(user, oficina), true);
    assert.equal(responsableCompatible({ ...user, activo: false }, oficina), false);
    assert.equal(responsableCompatible({ ...user, oficina_id: '2' }, oficina), false);
    assert.equal(responsableCompatible({ ...user, rol: 'Director(a)' }, oficina), false);
    assert.equal(responsableCompatible({ ...user, rol: 'Director(a)' }, { ...oficina, nombre: 'Dirección' }), true);
    assert.equal(responsableCompatible({ ...user, rol: 'Secretaria de Dirección' }, { ...oficina, nombre: 'Mesa de Partes' }), true);
});
test('PUT envia solo nombre, responsabilidad y motivo, con Bearer e ID textual', async () => {
    const previous = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        return new Response(JSON.stringify({ archivo }), { status: 200 });
    };
    try {
        await api.corregir('jwt-ficticio', big, { nombre: 'Archivo', responsabilidad: 'Finalidad', motivo: 'Correccion', oficina_id: '2', responsable_id: '3', fecha_inicio: 'invalida' });
        assert.ok(calls[0].url.endsWith('/api/archivos/' + big));
        assert.equal(calls[0].options.headers.get('Authorization'), 'Bearer jwt-ficticio');
        assert.deepEqual(JSON.parse(calls[0].options.body), { nombre: 'Archivo', responsabilidad: 'Finalidad', motivo: 'Correccion' });
    } finally { globalThis.fetch = previous; }
});
