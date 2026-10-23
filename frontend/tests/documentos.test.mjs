import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoDocumentoSchema, formularioDocumentoSchema } from '../src/features/documentos/schemas/documentos.schema.ts';
import { estadoMovimientoSchema } from '../src/features/movimientos/schemas/movimientos.schema.ts';
test('Contrato documental admite exactamente los cinco estados aprobados', /** Verifica el caso «Contrato documental admite exactamente los cinco estados aprobados»; una aserción fallida invalida este resultado. */ () => {
    for (const estado of ['PENDIENTE_DECISION', 'EN_TRASLADO', 'RECIBIDO', 'RECHAZADO', 'CANCELADO'])
        assert.equal(estadoDocumentoSchema.parse(estado), estado);
    for (const estado of ['PENDIENTE_ENVIO', 'DEVOLUCION_PENDIENTE', 'DEVUELTO', 'AUTORIZADO'])
        assert.equal(estadoDocumentoSchema.safeParse(estado).success, false);
});
test('El movimiento empieza con salida real y no admite pendiente de decision', /** Verifica el caso «El movimiento empieza con salida real y no admite pendiente de decision»; una aserción fallida invalida este resultado. */ () => {
    assert.equal(estadoMovimientoSchema.safeParse('PENDIENTE_DECISION').success, false);
    for (const estado of ['EN_TRASLADO', 'RECIBIDO', 'RECHAZADO', 'CANCELADO'])
        assert.equal(estadoMovimientoSchema.parse(estado), estado);
});
test('Formulario requiere tipo y asunto y conserva bigint como texto', /** Verifica el caso «Formulario requiere tipo y asunto y conserva bigint como texto»; una aserción fallida invalida este resultado. */ () => {
    const datos = { tipo_documental_id: '9007199254740993', asunto: ' Registro ', remitente: '', observaciones: '', archivador_id: '', motivo: '' };
    assert.equal(formularioDocumentoSchema.parse(datos).asunto, 'Registro');
    assert.equal(formularioDocumentoSchema.parse(datos).tipo_documental_id, datos.tipo_documental_id);
    for (const cambio of [{ tipo_documental_id: '' }, { asunto: '   ' }, { remitente: 'a'.repeat(251) }, { motivo: 'a'.repeat(1001) }])
        assert.equal(formularioDocumentoSchema.safeParse({ ...datos, ...cambio }).success, false);
});
