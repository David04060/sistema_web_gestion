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
  if (!identidad.ambito_id || ![3, 4, 5].includes(identidad.rol_id) || ([3,4].includes(identidad.rol_id) && identidad.oficina_id === null))
    throw new HttpError(403, 'No tiene ámbito documental');
  return identidad.ambito_id;
}
// Parámetros: identidad autenticada, rol y ámbito. Administrador carece de lectura documental.
export const lecturaSQL = `($1::bigint IS NOT NULL AND $2::smallint IS NOT NULL AND ($3::bigint IS NULL OR $3::bigint IS NOT NULL) AND public.documento_consultable_con_delegacion($1::bigint,d.id))`;
export const situacionCuentaSQL = `CASE
  WHEN d.situacion='DELEGADO' THEN COALESCE((
    SELECT CASE WHEN e.delegado_por=$1 THEN 'DELEGADO_POR_MI'
                WHEN e.usuario_indicado_id=$1 THEN 'DELEGADO_A_MI' END
    FROM delegaciones_documento e WHERE e.documento_id=d.id
  ), d.situacion)
  WHEN d.registrado_por=$1 AND d.situacion IN ('PERSONAL','GUARDADO_DIRECCION','EN_MESA_DE_PARTES') THEN 'EN_MI_OFICINA'
  ELSE d.situacion END`;
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
  d.revision::text,(${situacionCuentaSQL}) situacion_cuenta,public.documento_delegado_por($1,d.id) delegado_por_nombre,
  public.documento_consultable($1,d.id) lectura_ordinaria,
  EXISTS(SELECT 1 FROM delegaciones_documento e WHERE e.documento_id=d.id
    AND e.usuario_indicado_id IS NOT NULL) delegacion_registrada,
  (SELECT concat_ws(' ',u.nombre,u.apellido) FROM usuarios u WHERE u.id=d.registrado_por)
  registrado_por_nombre,documento_periodo_cerrado(d.id) historico_solo_lectura,
  (SELECT l.propietario_id::text FROM ubicaciones_documento u
   JOIN unidades_ubicacion l ON l.id=u.unidad_id WHERE u.documento_id=d.id AND u.vigente)
  titular_ubicacion FROM documentos d WHERE d.id=$4 AND ${lecturaSQL}`,
      [identidad.id, identidad.rol_id, identidad.ambito_id, id],
    )
  ).rows[0];
  if (!d) throw new HttpError(404, 'Documento inexistente o no autorizado');
  return d;
}
/** Separa lectura de escritura: ver documentos de otro ámbito nunca concede corrección, delegación ni PDF. */
export function permisos(identidad: Actor, d: Registro) {
  const propio = d.registrado_por === identidad.id && !d.historico_solo_lectura,
    compartido = identidad.ambito_id === d.ambito_id && [3, 4].includes(identidad.rol_id),
    vigente = d.situacion !== 'ANULADO' && !d.historico_solo_lectura && (identidad.rol_id === 5 || identidad.oficina_id !== null),
    antes = vigente && d.situacion !== 'DELEGADO';
  const direccionPendiente =
    compartido && identidad.rol_id === 3 && d.situacion === 'PENDIENTE_DIRECCION';
  const ubicacionPropia = d.titular_ubicacion === identidad.id;
  const puedeCerrarUbicacion = d.titular_ubicacion == null || ubicacionPropia;
  return {
    relacionar:
      d.lectura_ordinaria !== false && d.situacion !== 'ANULADO' && !!identidad.ambito_id &&
      ((identidad.rol_id === 5 && (identidad.ambito_id === d.ambito_id || d.historico_solo_lectura === true)) ||
       ([3,4].includes(identidad.rol_id) && identidad.oficina_id !== null)),
    corregir: vigente && propio && (identidad.rol_id !== 5 || d.situacion !== 'DELEGADO'),
    anular: (antes && (propio || direccionPendiente)) ||
      (vigente && propio && d.situacion === 'DELEGADO' && d.delegacion_registrada === true),
    delegar:
      vigente && puedeCerrarUbicacion &&
      (direccionPendiente ||
        (compartido && identidad.rol_id === 3 && d.situacion === 'GUARDADO_DIRECCION' && ubicacionPropia) ||
        (propio && identidad.rol_id === 4 && d.situacion === 'EN_MESA_DE_PARTES') ||
        (propio && identidad.rol_id === 5 && d.situacion === 'PERSONAL')),
    ubicar:
      vigente &&
      identidad.oficina_id !== null &&
      (direccionPendiente || (propio && ['PERSONAL', 'EN_MESA_DE_PARTES'].includes(d.situacion))),
    pdf:
      vigente && (compartido || (propio && [3, 4, 5].includes(identidad.rol_id))),
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
