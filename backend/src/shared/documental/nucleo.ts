/** Archivo: Reúne la cuenta actual, las operaciones indivisibles y los permisos de lectura y escritura
 * documental.
 */
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
/** Unidad de trabajo con identidad revalidada y contexto local para los triggers vigentes.
 * @param id Cuenta autenticada que ejecuta la operación.
 * @param motivo Texto que los triggers incorporan a la auditoría correspondiente.
 * @param fn Consulta o mutación que comparte conexión, actor y bloqueo de configuración.
 * @returns Resultado de fn después de COMMIT; un error revierte y siempre libera la conexión.
 */
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
    await cliente.query("SELECT set_config('app.actor_id',$1,true),set_config('app.motivo',$2,true)", [
      identidad.id,
      motivo,
    ]);
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
  if (
    !identidad.ambito_id ||
    ![3, 4, 5].includes(identidad.rol_id) ||
    ([3, 4].includes(identidad.rol_id) && identidad.oficina_id === null)
  )
    throw new HttpError(403, 'No tiene ámbito documental');
  return identidad.ambito_id;
}
// PostgreSQL añade la consulta del destinatario mediante documento_delegado_por; no concede escritura.
// Parámetros: identidad autenticada, rol y ámbito. Administrador carece de lectura documental.
export const lecturaSQL = `($1::bigint IS NOT NULL
 AND $2::smallint IS NOT NULL AND ($3::bigint IS NULL OR $3::bigint IS NOT NULL)
 AND public.documento_consultable_con_delegacion($1::bigint,d.id))`;
/** Proyecta la situación para la cuenta consultante sin modificar el estado persistido.
 * Usa los mismos parámetros actor/rol/ámbito de lecturaSQL; las etiquetas personales
 * dependen de autor, destinatario y periodo de oficina, no de pertenecer a otra oficina. */
export const situacionCuentaSQL = `CASE
  WHEN d.situacion='DELEGADO' THEN CASE
    WHEN EXISTS(SELECT 1 FROM delegaciones_documento e WHERE e.documento_id=d.id AND e.usuario_indicado_id=$1) THEN 'DELEGADO_A_MI'
    WHEN EXISTS(SELECT 1 FROM delegaciones_documento e WHERE e.documento_id=d.id AND e.delegado_por=$1) THEN 'DELEGADO_POR_MI'
    ELSE CASE WHEN d.registrado_por=$1 THEN 'EN_MI_OFICINA' ELSE 'PERSONAL' END END
  WHEN $2::smallint IN (3,4) AND d.situacion IN
    ('PENDIENTE_DIRECCION','GUARDADO_DIRECCION','EN_MESA_DE_PARTES') THEN d.situacion
  WHEN d.registrado_por=$1 AND d.situacion IN ('PERSONAL','GUARDADO_DIRECCION','EN_MESA_DE_PARTES') THEN 'EN_MI_OFICINA'
  WHEN d.situacion='PERSONAL' THEN CASE WHEN EXISTS (
    SELECT 1 FROM public.documentos_oficina archivo
    JOIN public.oficina_periodos periodo ON periodo.id=archivo.periodo_id
    JOIN public.oficina_periodos vigente ON vigente.oficina_id=periodo.oficina_id
    WHERE archivo.documento_id=d.id AND vigente.usuario_id=$1 AND vigente.fin IS NULL
  ) THEN 'EN_MI_OFICINA' ELSE 'PERSONAL' END
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
  EXISTS(SELECT 1 FROM delegaciones_documento e WHERE e.documento_id=d.id
    AND e.delegado_por<>d.registrado_por) delegacion_por_otro_actor,
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
/** Calcula cada acción por separado: consultar un documento o su PDF no concede permiso para modificarlos. */
export function permisos(identidad: Actor, d: Registro) {
  const recibido = Boolean(d.delegado_por_nombre),
    propio = d.registrado_por === identidad.id && !d.historico_solo_lectura,
    compartido = identidad.ambito_id === d.ambito_id && [3, 4].includes(identidad.rol_id),
    vigente =
      !recibido &&
      d.situacion !== 'ANULADO' &&
      !d.historico_solo_lectura &&
      (identidad.rol_id === 5 || identidad.oficina_id !== null),
    antes = vigente && d.situacion !== 'DELEGADO';
  // La delegación no concede escritura del registro original; atención y nueva delegación se calculan aparte.
  const direccionPendiente = compartido && identidad.rol_id === 3 && d.situacion === 'PENDIENTE_DIRECCION';
  // Para un alta propia de Secretaría, solo Dirección puede haber delegado por otro actor.
  const secretariaConDecision =
    identidad.rol_id === 4 &&
    (d.situacion === 'GUARDADO_DIRECCION' ||
      (d.situacion === 'DELEGADO' && d.delegacion_por_otro_actor === true));
  const ubicacionPropia = d.titular_ubicacion === identidad.id;
  const puedeCerrarUbicacion = d.titular_ubicacion == null || ubicacionPropia;
  return {
    // Relacionar no modifica el origen: solo el propio autor o un destinatario conserva esta opción.
    relacionar:
      (d.registrado_por === identidad.id || recibido) &&
      d.situacion !== 'ANULADO' &&
      !!identidad.ambito_id &&
      ((identidad.rol_id === 5 &&
        (recibido || identidad.ambito_id === d.ambito_id || d.historico_solo_lectura === true)) ||
        ([3, 4].includes(identidad.rol_id) && identidad.oficina_id !== null)),
    corregir: vigente && propio && (identidad.rol_id !== 5 || d.situacion !== 'DELEGADO'),
    anular:
      !secretariaConDecision &&
      ((antes && (propio || direccionPendiente)) ||
        (vigente && propio && d.situacion === 'DELEGADO' && d.delegacion_registrada === true)),
    acciones: recibido && d.situacion !== 'ANULADO' && !d.historico_solo_lectura,
    recorrido: identidad.rol_id === 3 || recibido || propio,
    delegar:
      (recibido && d.situacion === 'DELEGADO' && !d.historico_solo_lectura) ||
      (vigente &&
        puedeCerrarUbicacion &&
        (direccionPendiente ||
          (compartido && identidad.rol_id === 3 && d.situacion === 'GUARDADO_DIRECCION' && ubicacionPropia) ||
          (propio && identidad.rol_id === 4 && d.situacion === 'EN_MESA_DE_PARTES') ||
          (propio && identidad.rol_id === 5 && d.situacion === 'PERSONAL') ||
          (propio && d.situacion === 'DELEGADO'))),
    ubicar:
      vigente &&
      identidad.oficina_id !== null &&
      (direccionPendiente || (propio && ['PERSONAL', 'EN_MESA_DE_PARTES'].includes(d.situacion))),
    pdf: vigente && (compartido || (propio && [3, 4, 5].includes(identidad.rol_id))),
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
