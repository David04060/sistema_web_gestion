/** Archivo: Comprueba que una configuración o identidad incorrecta impide llegar a las escrituras de prueba.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validarConfiguracion, validarIdentidad, antesDeEscribir } from './helpers/entorno-prueba.mjs';

const manifiesto = {
  version: 1,
  host: '127.0.0.1',
  puerto: 55491,
  base: 'sistema_web_documental_final',
  rol: 'prueba_aabbcc',
  clave: 'solo-fixture',
  marca: 'a'.repeat(64),
  raiz: '/tmp/paillardelle-test-fixture',
  directorio: '/tmp/paillardelle-test-fixture/datos',
  sistema: '1234567890123456789',
};
const entorno = {
  NODE_ENV: 'test',
  DB_PROFILE: 'local',
  DATABASE_URL: 'postgresql://prueba_aabbcc:solo-fixture@127.0.0.1:55491/sistema_web_documental_final',
};
const identidad = {
  host: '127.0.0.1/32',
  puerto: 55491,
  base: manifiesto.base,
  rol: manifiesto.rol,
  esquema: 'public',
  directorio: manifiesto.directorio,
  sistema: manifiesto.sistema,
  marca: manifiesto.marca,
  oid: '45678',
};

test('El destino aislado se identifica sin depender de un OID concreto', () => {
  assert.doesNotThrow(() => validarConfiguracion(manifiesto, entorno));
  for (const oid of ['16384', '45678', '987654'])
    assert.doesNotThrow(() => validarIdentidad(manifiesto, { ...identidad, oid }));
});
for (const perfil of ['--neon', '--neon-qa'])
  test('El guard rechaza el perfil remoto por argumento ' + perfil, () => {
    assert.throws(() => validarConfiguracion(manifiesto, entorno, ['node', 'test.mjs', perfil]));
  });
for (const [caso, cambios] of [
  ['modo productivo', { NODE_ENV: 'production' }],
  ['perfil remoto', { DB_PROFILE: 'neon' }],
  ['Render', { RENDER: 'true' }],
  ['URL omitida', { DATABASE_URL: undefined }],
  ['puerto de trabajo', { DATABASE_URL: entorno.DATABASE_URL.replace(':55491/', ':5432/') }],
  ['host externo', { DATABASE_URL: entorno.DATABASE_URL.replace('127.0.0.1', 'db.example.invalid') }],
  ['otra base', { DATABASE_URL: entorno.DATABASE_URL.replace('/sistema_web_documental_final', '/postgres') }],
  ['otra cuenta', { DATABASE_URL: entorno.DATABASE_URL.replace('prueba_aabbcc:', 'postgres:') }],
])
  test('El guard rechaza ' + caso, () =>
    assert.throws(() => validarConfiguracion(manifiesto, { ...entorno, ...cambios })),
  );

for (const [caso, cambios] of [
  ['host de servidor', { host: '192.0.2.1/32' }],
  ['puerto de servidor', { puerto: 5432 }],
  ['base efectiva', { base: 'postgres' }],
  ['rol efectivo', { rol: 'postgres' }],
  ['esquema', { esquema: 'otro' }],
  ['directorio efectivo', { directorio: '/datos/trabajo' }],
  ['otro cluster', { sistema: '9876543210987654321' }],
  ['marca ausente', { marca: null }],
  ['marca distinta', { marca: 'b'.repeat(64) }],
])
  test('Antes de escribir se rechaza ' + caso, async () => {
    let escrituras = 0;
    const cliente = { query: async () => ({ rows: [{ ...identidad, ...cambios }] }) };
    await assert.rejects(
      antesDeEscribir(
        cliente,
        async () => {
          escrituras++;
        },
        { manifiesto, entorno },
      ),
    );
    assert.equal(escrituras, 0);
  });
test('Solo una identidad completa permite ejecutar la operación de escritura', async () => {
  let escrituras = 0;
  const cliente = { query: async () => ({ rows: [identidad] }) };
  assert.equal(await antesDeEscribir(cliente, async () => ++escrituras, { manifiesto, entorno }), 1);
  assert.equal(escrituras, 1);
});
