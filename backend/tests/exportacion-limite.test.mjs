/** Archivo: Comprueba el rechazo de exportaciones que exceden el límite y la liberación del turno.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { escribirExcel } from '../dist/modules/documentos/exportacion.excel.js';

test('Un texto fuera del límite de celda rechaza el archivo antes de crear una descarga parcial', async () => {
  const d = await mkdtemp(join(tmpdir(), 'excel-limite-'));
  const ruta = join(d, 'rechazado.xlsx');
  try {
    await assert.rejects(
      escribirExcel(ruta, [{ asunto: 'x'.repeat(32768) }], new Date()),
      (e) => e.status === 422,
    );
    assert.equal(existsSync(ruta), false);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});
