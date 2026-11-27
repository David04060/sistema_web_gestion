/** Archivo: Comprueba destino, cuenta y marca del PostgreSQL temporal antes de permitir las pruebas.
 */
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import pg from 'pg';

export const consultaIdentidad = `SELECT current_database() base,inet_server_addr()::text host,
 inet_server_port() puerto,current_user rol,current_schema() esquema,
 current_setting('data_directory') directorio,(pg_control_system()).system_identifier::text sistema,
 current_setting('pruebas.ejecucion',true) marca,
 (SELECT oid::text FROM pg_database WHERE datname=current_database()) oid`;

/** El manifiesto pertenece a un cluster recién creado; nunca se deduce desde .env. */
export function validarConfiguracion(m, e = process.env, argv = process.argv) {
  if (argv.some((a) => a === '--neon' || a === '--neon-qa'))
    throw Error('Los perfiles remotos no están permitidos en pruebas aisladas');
  if (
    !m ||
    m.version !== 1 ||
    m.host !== '127.0.0.1' ||
    !Number.isInteger(m.puerto) ||
    m.puerto < 1024 ||
    m.puerto > 65535 ||
    m.puerto === 5432 ||
    m.base !== 'sistema_web_documental_final' ||
    !/^prueba_[a-f0-9]+$/.test(m.rol) ||
    !m.clave ||
    !/^[a-f0-9]{64}$/.test(m.marca) ||
    !/^\d{10,}$/.test(m.sistema) ||
    !path.basename(m.raiz ?? '').startsWith('paillardelle-test-') ||
    path.resolve(m.directorio ?? '') !== path.resolve(m.raiz, 'datos')
  )
    throw Error('Manifiesto de prueba inválido');
  if (e.NODE_ENV !== 'test' || e.DB_PROFILE !== 'local' || e.RENDER === 'true' || !e.DATABASE_URL)
    throw Error('Se exige el entorno aislado de pruebas');
  let u;
  try {
    u = new URL(e.DATABASE_URL);
  } catch {
    throw Error('Conexión de prueba inválida');
  }
  if (
    !['postgres:', 'postgresql:'].includes(u.protocol) ||
    u.hostname !== m.host ||
    Number(u.port) !== m.puerto ||
    u.pathname !== '/' + m.base ||
    decodeURIComponent(u.username) !== m.rol ||
    decodeURIComponent(u.password) !== m.clave ||
    u.search ||
    u.hash
  )
    throw Error('La conexión no corresponde a la instancia temporal');
  return m;
}

/** OID es informativo: la identidad se liga al cluster, ruta y marca del servidor. */
export function validarIdentidad(m, i) {
  const expected = {
    host: '127.0.0.1/32',
    puerto: m.puerto,
    base: m.base,
    rol: m.rol,
    esquema: 'public',
    sistema: m.sistema,
    marca: m.marca,
  };
  for (const [key, value] of Object.entries(expected))
    if (i?.[key] !== value) throw Error('Identidad de prueba incorrecta: ' + key);
  if (path.resolve(i.directorio) !== path.resolve(m.directorio))
    throw Error('Identidad de prueba incorrecta: directorio');
  return i;
}

export function cargarManifiesto() {
  const file = process.env.POSTGRES_TEST_MANIFEST;
  if (!file || !path.isAbsolute(file))
    throw Error('Ejecuta las pruebas PostgreSQL mediante npm test o el runner aislado');
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  validarConfiguracion(m);
  if (
    fs.realpathSync(path.dirname(file)) !== fs.realpathSync(m.raiz) ||
    fs.realpathSync(m.directorio) !== fs.realpathSync(path.join(m.raiz, 'datos'))
  )
    throw Error('Manifiesto fuera de su directorio temporal');
  return m;
}

export async function verificarEntornoPrueba(cliente) {
  const m = cargarManifiesto();
  const owned = !cliente,
    c =
      cliente ??
      new pg.Client({
        connectionString: process.env.DATABASE_URL,
        options: '-c default_transaction_read_only=on',
      });
  try {
    if (owned) await c.connect();
    validarIdentidad(m, (await c.query(consultaIdentidad)).rows[0]);
    return m;
  } finally {
    if (owned) await c.end();
  }
}

/** Una identidad rechazada no llega a invocar el callback que puede escribir. */
export async function antesDeEscribir(c, operacion, config) {
  const m = config?.manifiesto ?? cargarManifiesto();
  validarConfiguracion(m, config?.entorno ?? process.env);
  validarIdentidad(m, (await c.query(consultaIdentidad)).rows[0]);
  return operacion(c);
}

export function leerFixtures() {
  const m = cargarManifiesto();
  return JSON.parse(fs.readFileSync(path.join(m.raiz, 'fixtures.json'), 'utf8'));
}
