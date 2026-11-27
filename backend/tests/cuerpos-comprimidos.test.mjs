/** Archivo: Comprueba que los cuerpos comprimidos alterados no interrumpen el servidor HTTP de prueba.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Buffer } from 'node:buffer';
import { gzipSync } from 'node:zlib';
import express from 'express';

test('JSON comprimido y bytes finales no terminan el servidor HTTP', async () => {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.post('/json', (req, res) => res.json(req.body));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use((error, _req, res, next) => {
    void next;
    res.status(error.status ?? 500).json({ error: 'Cuerpo inválido' });
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const valido = gzipSync(JSON.stringify({ verificacion: 'aislada' }));
    const post = (body) =>
      fetch(base + '/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
        body,
      });
    const normal = await post(valido);
    assert.equal(normal.status, 200);
    assert.deepEqual(await normal.json(), { verificacion: 'aislada' });
    const alterado = await post(Buffer.concat([valido, Buffer.from('bytes-finales-invalidos')]));
    assert.ok([200, 400].includes(alterado.status));
    await alterado.arrayBuffer();
    const health = await fetch(base + '/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
    const sinComprimir = await fetch(base + '/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordinario: true }),
    });
    assert.equal(sinComprimir.status, 200);
    assert.deepEqual(await sinComprimir.json(), { ordinario: true });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
