import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrarSchema, corregirSchema, anularSchema, filtrosSchema } from '../dist/modules/documentos/documentos.schema.js';
import { derivarSchema, recepcionSchema } from '../dist/modules/movimientos/movimientos.schema.js';
const documento = { clasificacion_registro: 'RECIBIDO', tipo_documental_id: '2', asunto: ' Asunto ', remitente: null, observaciones: null, archivador_id: null };
test('Documentos: solo contenido editable, sin campos generados ni eliminados', /** Verifica el caso «Documentos: solo contenido editable, sin campos generados ni eliminados»; una aserción fallida invalida este resultado. */ () => {
    assert.equal(registrarSchema.parse(documento).asunto, 'Asunto');
    for (const campo of ['codigo', 'fecha_creacion', 'registrado_por_id', 'responsable_actual_id', 'estado_tramite', 'numero_documento', 'fecha_documento', 'numero_registro', 'anio_codigo', 'consecutivo_codigo'])
        assert.equal(registrarSchema.safeParse({ ...documento, [campo]: '1' }).success, false);
    assert.equal(registrarSchema.safeParse({ ...documento, asunto: ' ' }).success, false);
});
test('Correccion y anulacion exigen motivo y rechazan manipular custodia', /** Verifica el caso «Correccion y anulacion exigen motivo y rechazan manipular custodia»; una aserción fallida invalida este resultado. */ () => {
    const datos = { asunto: 'Asunto', remitente: null, observaciones: null };
    assert.equal(corregirSchema.safeParse({ ...datos, motivo: '' }).success, false);
    assert.equal(corregirSchema.safeParse({ ...datos, motivo: 'Corregir', archivador_id: '1' }).success, false);
    assert.equal(anularSchema.safeParse({ motivo: ' ' }).success, false);
    assert.equal(anularSchema.safeParse({ motivo: 'x'.repeat(1001) }).success, false);
});
test('Filtros y movimientos validan bigint, paginacion y autoridad del servidor', /** Verifica el caso «Filtros y movimientos validan bigint, paginacion y autoridad del servidor»; una aserción fallida invalida este resultado. */ () => {
    assert.equal(filtrosSchema.safeParse({ pagina: '0' }).success, false);
    assert.equal(filtrosSchema.safeParse({ responsable_id: '9223372036854775808' }).success, false);
    assert.equal(derivarSchema.safeParse({ documento_id: '1', usuario_destino_id: '2', motivo: 'Derivar', usuario_origen_id: '3' }).success, false);
    assert.equal(recepcionSchema.safeParse({ archivador_id: null, recibido_por_id: '2' }).success, false);
});
