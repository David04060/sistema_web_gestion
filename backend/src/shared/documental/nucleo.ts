import type { PoolClient } from 'pg';
import { pool } from '../../config/database.js';
import { HttpError } from '../http/HttpError.js';
export interface Actor {
  id: string;
  rol_id: number;
  oficina_id: string | null;
  ambito_id: string | null;
  activo: boolean;
}
/** Reconsulta actividad, rol y ámbito dentro de la transacción; no confía en parámetros del cliente. */
export async function actorActual(cliente: PoolClient, id: string): Promise<Actor> {
  const identidad = (
    await cliente.query<Actor>(
      `SELECT u.id::text,u.rol_id,u.oficina_id::text,m.ambito_id::text,
  u.activo FROM usuarios u LEFT JOIN miembros_ambito m ON m.usuario_id=u.id WHERE u.id=$1`,
      [id],
    )
  ).rows[0];
  if (!identidad?.activo) throw new HttpError(401, 'Cuenta inactiva');
  return identidad;
}
/** Identidad revalidada y configuración exclusivamente transaccional de los triggers nuevos. */
export async function operacion<T>(
  id: string,
  motivo: string,
  fn: (cliente: PoolClient, identidad: Actor) => Promise<T>,
): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query("SELECT pg_advisory_xact_lock(hashtext('documental-configuracion'))");
    const identidad = await actorActual(cliente, id);
    await cliente.query(
      "SELECT set_config('app.actor_id',$1,true),set_config('app.motivo',$2,true)",
      [identidad.id, motivo],
    );
    const r = await fn(cliente, identidad);
    await cliente.query('COMMIT');
    return r;
  } catch (e) {
    await cliente.query('ROLLBACK');
    throw e;
  } finally {
    cliente.release();
  }
}
/** Solo los dos roles administrativos pueden gestionar cuentas y oficinas. */
export function exigirAdministracion(identidad: Actor) {
  if (![1, 2].includes(identidad.rol_id)) throw new HttpError(403, 'Se requiere administración');
}
/** Los roles documentales necesitan pertenencia vigente para registrar en su ámbito. */
export function exigirAmbito(identidad: Actor) {
  if (!identidad.ambito_id || ![3, 4, 5].includes(identidad.rol_id))
    throw new HttpError(403, 'No tiene ámbito documental');
  return identidad.ambito_id;
}
// Parámetros: identidad autenticada, rol y ámbito. Administrador carece de lectura documental.
export const lecturaSQL = `(
  $1::bigint IS NOT NULL AND (
    $2::smallint=1 OR (
      d.situacion<>'ANULADO' AND (
        $2::smallint IN (3,4) OR ($2::smallint=5 AND d.ambito_id=$3::bigint)
      )
    )
  )
)`;
export interface Registro {
  id: string;
  ambito_id: string;
  registrado_por: string;
  situacion: string;
  revision: string;
  [k: string]: unknown;
}
/** Aplica lectura institucional/personal; el bloqueo opcional precede a las mutaciones y a su revisión. */
export async function documento(
  cliente: PoolClient,
  identidad: Actor,
  id: string,
  bloquear = false,
): Promise<Registro> {
  if (bloquear) await cliente.query('SELECT id FROM documentos WHERE id=$1 FOR UPDATE', [id]);
  const d = (
    await cliente.query<Registro>(
      `SELECT d.*,d.id::text,d.ambito_id::text,d.tipo_id::text,d.registrado_por::text,
  d.revision::text,(SELECT concat_ws(' ',u.nombre,u.apellido) FROM usuarios u WHERE u.id=d.registrado_por)
  registrado_por_nombre FROM documentos d WHERE d.id=$1 AND ${lecturaSQL}`,
      [id, identidad.rol_id, identidad.ambito_id],
    )
  ).rows[0];
  if (!d) throw new HttpError(404, 'Documento inexistente o no autorizado');
  return d;
}
/** Separa lectura de escritura: ver documentos de otro ámbito nunca concede corrección, delegación ni PDF. */
export function permisos(identidad: Actor, d: Registro) {
  const propio = d.registrado_por === identidad.id,
    compartido = identidad.ambito_id === d.ambito_id && [3, 4].includes(identidad.rol_id),
    vigente = d.situacion !== 'ANULADO',
    antes = vigente && d.situacion !== 'DELEGADO';
  const direccionPendiente =
    compartido && identidad.rol_id === 3 && d.situacion === 'PENDIENTE_DIRECCION';
  return {
    relacionar:
      vigente && identidad.ambito_id === d.ambito_id && [3, 4, 5].includes(identidad.rol_id),
    corregir: vigente && propio && (identidad.rol_id !== 5 || d.situacion !== 'DELEGADO'),
    anular: antes && (propio || direccionPendiente),
    delegar:
      vigente &&
      (direccionPendiente ||
        (propio && identidad.rol_id === 4 && d.situacion === 'EN_MESA_DE_PARTES') ||
        (propio && identidad.rol_id === 5 && d.situacion === 'PERSONAL')),
    ubicar:
      vigente &&
      identidad.oficina_id !== null &&
      (direccionPendiente || (propio && ['PERSONAL', 'EN_MESA_DE_PARTES'].includes(d.situacion))),
    pdf:
      vigente && (compartido || (propio && identidad.rol_id === 5 && d.situacion !== 'DELEGADO')),
  };
}
/** Rechaza escrituras sobre una revisión anterior antes de modificar datos. */
export function exigirRevision(d: Registro, revision: string) {
  if (d.revision !== revision) throw new HttpError(409, 'El documento cambió; vuelva a consultar');
}
/** Registra el antes/después público con actor y motivo transaccionales; el llamador excluye secretos. */
export async function auditarConfiguracion(
  cliente: PoolClient,
  identidad: Actor,
  entidad: string,
  id: string,
  accion: string,
  antes: unknown,
  despues: unknown,
) {
  await cliente.query(
    `INSERT INTO auditoria_configuracion(actor_id,entidad,entidad_id,
  accion,anterior,posterior,motivo) VALUES($1,$2,$3,$4,$5,$6,
  nullif(current_setting('app.motivo',true),''))`,
    [identidad.id, entidad, id, accion, JSON.stringify(antes), JSON.stringify(despues)],
  );
}
