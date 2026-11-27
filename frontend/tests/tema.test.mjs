/** Archivo: Comprueba elección y persistencia de apariencia sin depender de un navegador.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'vite';

test('La preferencia manual prevalece; almacenamiento ausente, corrupto o bloqueado permite usar el sistema', async () => {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: { write: false, minify: false, lib: { entry: 'src/lib/tema.ts', formats: ['es'] } },
  });
  const chunk = (Array.isArray(result) ? result : [result])
    .flatMap((r) => r.output)
    .find((c) => c.type === 'chunk' && c.isEntry);
  const { resolverTema, guardarTema } = await import(
    'data:text/javascript;base64,' + Buffer.from(chunk.code).toString('base64')
  );
  assert.equal(resolverTema({ getItem: () => null }, true), 'oscuro');
  assert.equal(resolverTema({ getItem: () => null }, false), 'claro');
  assert.equal(resolverTema({ getItem: () => 'claro' }, true), 'claro');
  assert.equal(resolverTema({ getItem: () => 'oscuro' }, false), 'oscuro');
  assert.equal(resolverTema({ getItem: () => 'otro' }, true), 'oscuro');
  assert.equal(
    resolverTema(
      {
        getItem: () => {
          throw Error('Bloqueado');
        },
      },
      true,
    ),
    'oscuro',
  );
  let guardado;
  guardarTema(
    {
      setItem: (key, value) => {
        guardado = { key, value };
      },
    },
    'oscuro',
  );
  assert.deepEqual(guardado, { key: 'paillardelle-tema', value: 'oscuro' });
  assert.doesNotThrow(() =>
    guardarTema(
      {
        setItem: () => {
          throw Error('Bloqueado');
        },
      },
      'claro',
    ),
  );
});
