/** Archivo: Comprueba orígenes del navegador, rutas protegidas y límite por IP en un servidor temporal.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

// HTTP real sin conexiones SQL: las solicitudes de login son inválidas antes del servicio.
process.env.DATABASE_URL = 'postgresql://fixture:fixture@127.0.0.1:1/sistema_web_documental_final';
process.env.JWT_SECRET = 'secreto-exclusivo-de-pruebas-locales-000000';
process.env.CORS_ORIGINS = 'https://qa-pages.example';
process.env.TRUST_PROXY_HOPS = '1';
const { app } = await import('../dist/app.js');
const { pool } = await import('../dist/config/database.js');

test('CORS, protección de rutas y límite por IP detrás de un proxy', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    await t.test('salud conserva su contrato y CORS exacto', async () => {
      const r = await fetch(base + '/api/health', { headers: { Origin: 'https://qa-pages.example' } });
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('access-control-allow-origin'), 'https://qa-pages.example');
      assert.equal(r.headers.has('access-control-allow-credentials'), false);
      assert.equal((await r.json()).status, 'ok');
    });
    await t.test('origen no permitido y subdominio engañoso se rechazan', async () => {
      for (const origin of ['https://otro.example', 'https://qa-pages.example.atacante.example']) {
        const r = await fetch(base + '/api/health', { headers: { Origin: origin } });
        assert.equal(r.status, 403);
        assert.equal(r.headers.has('access-control-allow-origin'), false);
      }
    });
    await t.test('preflight admite Authorization y rechaza cabeceras ajenas', async () => {
      for (const [headers, status] of [
        ['authorization,content-type', 204],
        ['x-otro', 403],
      ]) {
        const r = await fetch(base + '/api/documentos', {
          method: 'OPTIONS',
          headers: {
            Origin: 'https://qa-pages.example',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': headers,
          },
        });
        assert.equal(r.status, status);
      }
    });
    await t.test('rutas protegidas siguen requiriendo JWT', async () => {
      for (const ruta of ['/api/auth/me', '/api/documentos', '/api/dashboard']) {
        assert.equal((await fetch(base + ruta)).status, 401);
      }
    });
    await t.test('diez intentos, bloqueo once y prefijo XFF falsificado sin bypass', async () => {
      for (let i = 0; i < 11; i++) {
        const r = await fetch(base + '/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': `203.0.113.${i + 1}, 198.51.100.77`,
          },
          body: '{}',
        });
        assert.equal(r.status, i < 10 ? 400 : 429);
      }
      const otra = await fetch(base + '/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '198.51.100.78',
        },
        body: '{}',
      });
      assert.equal(otra.status, 400);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
