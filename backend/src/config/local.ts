import type { ClientBase } from 'pg';
export function validarUrlLocal(valor: string) {
  const u = new URL(valor);
  if (
    !['postgres:', 'postgresql:'].includes(u.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) ||
    u.pathname !== '/sistema_web_documental_final'
  )
    throw new Error('Se requiere sistema_web_documental_final local');
  return u;
}
export async function verificarConexionLocal(
  c: Pick<ClientBase, 'query'>,
  conexion: string,
  comprobarEsquema = true,
) {
  const u = validarUrlLocal(conexion),
    identidad = (
      await c.query(
        `SELECT current_database() base,inet_server_addr()::text host,
  inet_server_port() puerto,(SELECT oid::text FROM pg_database WHERE datname=current_database())
  oid,current_schema() esquema,current_user rol,current_setting('neon.branch_id',
  true) rama`,
      )
    ).rows[0];
  if (
    identidad.base !== 'sistema_web_documental_final' ||
    !['127.0.0.1/32', '::1/128'].includes(identidad.host) ||
    identidad.puerto !== Number(u.port || 5432) ||
    identidad.esquema !== 'public' ||
    identidad.rama
  )
    throw new Error('Identidad local incompatible');
  if (comprobarEsquema) {
    await c.query(
      'SELECT d.ambito_id,d.tipo_id,d.registrado_por,d.situacion,d.revision FROM documentos d LIMIT 0',
    );
    await c.query('SELECT revision_esperada FROM pdf_cargas LIMIT 0');
  }
  return identidad;
}
