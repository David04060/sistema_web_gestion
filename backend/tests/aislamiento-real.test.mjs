/** Archivo: Comprueba la identidad de la instancia temporal y el rechazo de bases o ejecuciones ajenas.
 */
import './helpers/exigir-aislamiento.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import pg from 'pg';
import {
  cargarManifiesto,
  consultaIdentidad,
  validarIdentidad,
  antesDeEscribir,
} from './helpers/entorno-prueba.mjs';

test('El cluster real y su marca coinciden; cambiar el OID no es necesario', async () => {
  const m = cargarManifiesto(),
    c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const i = (await c.query(consultaIdentidad)).rows[0];
    assert.doesNotThrow(() => validarIdentidad(m, i));
    assert.match(i.oid, /^[1-9]\d*$/);
    assert.throws(() => validarIdentidad({ ...m, sistema: m.sistema + '0' }, i));
  } finally {
    await c.end();
  }
});

test('La base postgres del mismo servidor se rechaza antes de crear una tabla', async () => {
  const c = new pg.Client({
    connectionString: process.env.DATABASE_URL.replace('/sistema_web_documental_final', '/postgres'),
  });
  await c.connect();
  try {
    await assert.rejects(
      antesDeEscribir(c, () => c.query('CREATE TABLE no_debe_crearse(id int)')),
      /base/,
    );
    assert.equal((await c.query("SELECT to_regclass('public.no_debe_crearse') tabla")).rows[0].tabla, null);
  } finally {
    await c.end();
  }
});

test('Invocar directamente un test SQL sin manifiesto falla antes de ejecutar sus casos', async () => {
  const env = { ...process.env };
  delete env.POSTGRES_TEST_MANIFEST;
  delete env.NODE_TEST_CONTEXT;
  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--test', fileURLToPath(new URL('./documental-nuevo.test.mjs', import.meta.url))],
      { env, windowsHide: true },
    );
    let salida = '';
    child.stdout.on('data', (b) => (salida += b));
    child.stderr.on('data', (b) => (salida += b));
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, salida }));
  });
  assert.notEqual(result.code, 0);
  assert.match(result.salida, /runner aislado|mediante npm test/);
  assert.ok(!result.salida.includes('skipping running files'));
});
