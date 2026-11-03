import { validarUrlLocal, verificarConexionLocal } from './local.js';
import pg, { type ClientBase } from 'pg';
import { env, perfilNeon } from './env.js';
import { validarIdentidadPostgres, type IdentidadPostgres } from './neon.js';
const { Pool } = pg;
// Validar antes de abrir un socket, también al ejecutar pruebas o NODE_ENV=production.
if (!perfilNeon) validarUrlLocal(env.DATABASE_URL);
/** Pool compartido: las credenciales provienen del entorno y nunca se registran. */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  verify: (cliente, listo) => {
    void verificarConexionConfigurada(cliente).then(
      () => listo(),
      (error) =>
        listo(error instanceof Error ? error : new Error('Identidad PostgreSQL incorrecta')),
    );
  },
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});
pool.on('error', (error) => {
  console.error('Error inesperado del pool PostgreSQL:', { tipo: error.name });
});
/** Verifica cada conexi�n nueva contra su destino expl�cito antes de permitir consultas del sistema. */
async function verificarConexionConfigurada(cliente: ClientBase) {
  if (!perfilNeon) return verificarConexionLocal(cliente, env.DATABASE_URL);
  const identidad = (
    await cliente.query<IdentidadPostgres>(`SELECT current_database() base_datos,current_user usuario,
 current_setting('server_version') version,current_setting('neon.branch_id',true) rama`)
  ).rows[0];
  const socket = (
    cliente as unknown as {
      connection?: { stream?: { encrypted?: boolean; authorized?: boolean } };
    }
  ).connection?.stream;
  const tls = socket?.encrypted === true && socket.authorized === true;
  validarIdentidadPostgres(
    identidad,
    tls,
    true,
    process.env.NEON_BRANCH_ID,
    'sistema_web_app',
    env.NEON_DATABASE,
  );
  // No basta con un nombre de base correcto: el backend necesita el modelo documental vigente.
  await cliente.query(
    'SELECT ambito_id,tipo_id,registrado_por,situacion,revision FROM documentos LIMIT 0',
  );
  await cliente.query('SELECT revision_esperada FROM pdf_cargas LIMIT 0');
  await cliente.query('SELECT usuario_id,ambito_id FROM miembros_ambito LIMIT 0');
  return { ...identidad, tls };
}
/** Verifica el destino configurado antes de abrir HTTP; nunca imprime cadenas de conexi�n. */
export async function verificarBaseDatos() {
  const cliente = await pool.connect();
  try {
    const identidad = await verificarConexionConfigurada(cliente);
    console.log(
      perfilNeon ? 'PostgreSQL Neon verificado:' : 'PostgreSQL local verificado:',
      identidad,
    );
    return identidad;
  } finally {
    cliente.release();
  }
}
/** Libera las conexiones durante apagado normal o fallo de arranque. */
export async function cerrarBaseDatos(): Promise<void> {
  await pool.end();
}
