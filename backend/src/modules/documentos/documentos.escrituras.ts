/** Archivo: Registra y modifica documentos con permiso, revisión y transacciones que deshacen cualquier
 * operación incompleta.
 */
import type { PoolClient } from 'pg';
import type { z } from 'zod';
import { alta, correccion, delegacion, ubicacion, anulacion } from './documental.schema.js';
import {
  operacion,
  documento,
  exigirAmbito,
  exigirRevision,
  permisos,
  type Actor,
} from '../../shared/documental/nucleo.js';
import { HttpError } from '../../shared/http/HttpError.js';
import { detalle } from './documentos.consultas.js';
import { unidadPropiaActiva } from './ubicacion.reglas.js';

/** Alta atómica con relación, ubicación o delegación inicial; el trigger asigna el correlativo.
 * @param actor Cuenta autenticada que conservará la autoría del registro.
 * @param datos Alta validada con clasificación, tipo y destino/ubicación opcionales.
 * @returns Detalle autorizado del documento después de confirmar la transacción.
 * Un rechazo revierte registro, hechos y contador. La carga del PDF es otra operación.
 */
export async function registrar(actor: string, datos: z.infer<typeof alta>) {
  const nuevo = await operacion(actor, 'Registro', async (cliente, identidad) => {
    const ambito = exigirAmbito(identidad);
    // El destino inicial debe corresponder al recorrido del perfil; no se guarda y delega a la vez en Dirección.
    if (datos.conservar_en_mesa && identidad.rol_id !== 4)
      throw new HttpError(403, 'Solo Secretaría conserva en Mesa de Partes');
    if (datos.destino && identidad.rol_id === 4 && !datos.conservar_en_mesa)
      throw new HttpError(400, 'Para delegar al registrar, Secretaría debe conservar en Mesa de Partes');
    if (datos.destino && identidad.rol_id === 3 && datos.unidad_id)
      throw new HttpError(400, 'La delegación inmediata no admite guardar en Dirección');
    if (datos.unidad_id) {
      if (identidad.rol_id === 4 && !datos.conservar_en_mesa)
        throw new HttpError(400, 'Para indicar ubicación, conserva el documento en Mesa de Partes');
      await exigirUnidadVigente(cliente, identidad, datos.unidad_id);
    }
    if (datos.origen_id) {
      const origen = await documento(cliente, identidad, datos.origen_id, true);
      if (origen.situacion === 'ANULADO' || (origen.registrado_por !== identidad.id && !origen.delegado_por_nombre))
        throw new HttpError(403, 'Origen no autorizado');
    }
    const situacion =
      identidad.rol_id === 5
        ? 'PERSONAL'
        : identidad.rol_id === 4 && datos.conservar_en_mesa
          ? 'EN_MESA_DE_PARTES'
          : 'PENDIENTE_DIRECCION';
    const d = (
      await cliente.query(
        `INSERT INTO documentos(ambito_id,tipo_id,registrado_por,clasificacion,
  asunto,remitente,observaciones,situacion) VALUES($1,$2,$3,$4,
  $5,$6,$7,$8) RETURNING id::text`,
        [
          ambito,
          datos.tipo_id,
          identidad.id,
          datos.clasificacion,
          datos.asunto,
          datos.remitente,
          datos.observaciones,
          situacion,
        ],
      )
    ).rows[0];
    if (datos.origen_id)
      await cliente.query(
        'INSERT INTO documentos_relaciones(documento_id,origen_id,creado_por) VALUES($1,$2,$3)',
        [d.id, datos.origen_id, identidad.id],
      );
    if (datos.unidad_id) await registrarUbicacion(cliente, d.id, datos.unidad_id, identidad.id);
    if (datos.destino) {
      const registro = await documento(cliente, identidad, d.id, true);
      if (!permisos(identidad, registro).delegar) throw new HttpError(403, 'Delegación no autorizada');
      await insertarDelegacion(cliente, identidad.id, d.id, datos.destino);
    }
    return d.id as string;
  });
  return detalle(actor, nuevo);
}
/** Solo el autor autorizado corrige contenido con revisión y motivo. */
export async function corregir(actor: string, documentoId: string, datos: z.infer<typeof correccion>) {
  await operacion(actor, datos.motivo, async (cliente, identidad) => {
    const d = await documento(cliente, identidad, documentoId, true);
    if (!permisos(identidad, d).corregir) throw new HttpError(403, 'Corrección no autorizada');
    exigirRevision(d, datos.revision);
    await cliente.query('UPDATE documentos SET asunto=$2,remitente=$3,observaciones=$4 WHERE id=$1', [
      documentoId,
      datos.asunto,
      datos.remitente,
      datos.observaciones,
    ]);
  });
  return detalle(actor, documentoId);
}
/** Comparte validación y escritura entre el alta atómica y la delegación posterior. */
async function insertarDelegacion(
  cliente: PoolClient,
  actor: string,
  documentoId: string,
  datos: Omit<z.infer<typeof delegacion>, 'revision'>,
) {
  let nombre = datos.nombre;
  if (datos.usuario_id) {
    const u = (
      await cliente.query(
        `SELECT u.oficina_id::text,concat(u.nombre,' ',u.apellido) nombre
         FROM usuarios u JOIN roles rol ON rol.id=u.rol_id
         WHERE u.id=$1 AND u.activo
           AND rol.codigo NOT IN ('ADMINISTRADOR','SUPERADMINISTRADOR') FOR SHARE OF u,rol`,
        [datos.usuario_id],
      )
    ).rows[0];
    if (!u || (datos.oficina_id && u.oficina_id !== datos.oficina_id))
      throw new HttpError(400, 'Persona y oficina incompatibles');
    nombre = u.nombre;
  }
  await cliente.query(
    `INSERT INTO delegaciones_documento(documento_id,oficina_indicada_id,
usuario_indicado_id,nombre_persona_guardado,observaciones,delegado_por) VALUES($1,
$2,$3,$4,$5,$6)`,
    [documentoId, datos.oficina_id, datos.usuario_id, nombre, datos.observaciones, actor],
  );
}

/**
 * Guarda un destino registrado o manual; solo el registrado obtiene consulta y no se transfiere el
 * ámbito.
 */
export async function delegar(actor: string, documentoId: string, datos: z.infer<typeof delegacion>) {
  await operacion(actor, 'Delegación indicada', async (cliente, identidad) => {
    const d = await documento(cliente, identidad, documentoId, true);
    exigirRevision(d, datos.revision);
    if (!permisos(identidad, d).delegar) throw new HttpError(403, 'Delegación no autorizada');
    await insertarDelegacion(cliente, identidad.id, documentoId, datos);
  });
  return detalle(actor, documentoId);
}
/** Sustituye la ubicación vigente conservando las anteriores y la revisión del documento. */
export async function ubicar(actor: string, documentoId: string, datos: z.infer<typeof ubicacion>) {
  await operacion(actor, 'Ubicación', async (cliente, identidad) => {
    const d = await documento(cliente, identidad, documentoId, true);
    if (!permisos(identidad, d).ubicar) throw new HttpError(403, 'Ubicación no autorizada');
    exigirRevision(d, datos.revision);
    await exigirUnidadVigente(cliente, identidad, datos.unidad_id);
    await cliente.query('UPDATE ubicaciones_documento SET vigente=false WHERE documento_id=$1 AND vigente', [
      documentoId,
    ]);
    await registrarUbicacion(cliente, documentoId, datos.unidad_id, identidad.id);
    // El trigger de ubicación ya actualiza el documento cuando pasa a Guardado en Dirección.
    if (d.situacion !== 'PENDIENTE_DIRECCION')
      await cliente.query('UPDATE documentos SET revision=revision+1 WHERE id=$1', [documentoId]);
  });
  return detalle(actor, documentoId);
}

/** Comprueba la unidad y sus antecesores dentro de la transacción que la asigna. */
async function exigirUnidadVigente(cliente: PoolClient, identidad: Actor, unidadId: string) {
  const resultado = await cliente.query(
    `WITH RECURSIVE cadena AS (
       SELECT u.id,u.padre_id
       FROM unidades_ubicacion u JOIN oficinas o ON o.id=u.oficina_id AND o.activa
       WHERE ${unidadPropiaActiva} AND u.id=$3
       UNION
       SELECT u.id,u.padre_id FROM cadena c JOIN unidades_ubicacion u ON u.id=c.padre_id
       WHERE ${unidadPropiaActiva}
     )
     SELECT 1 FROM cadena WHERE padre_id IS NULL`,
    [identidad.id, identidad.oficina_id, unidadId],
  );
  if (!resultado.rowCount) throw new HttpError(400, 'Selecciona una ubicación propia y vigente');
}
/** Marca el documento como anulado sin borrar su registro ni historia.
 * El disparador SQL programa la retención del PDF; esta función no elimina archivos de R2. */
export async function anular(actor: string, documentoId: string, datos: z.infer<typeof anulacion>) {
  await operacion(actor, datos.motivo, async (cliente, identidad) => {
    const d = await documento(cliente, identidad, documentoId, true);
    if (!permisos(identidad, d).anular) throw new HttpError(403, 'Anulación no autorizada');
    exigirRevision(d, datos.revision);
    await cliente.query(
      "UPDATE documentos SET situacion_antes_anulacion=situacion,situacion='ANULADO' WHERE id=$1",
      [documentoId],
    );
  });
  return { anulado: true };
}

/** El trigger guarda la ruta y oficina históricas; el cliente aporta solo una unidad propia. */
async function registrarUbicacion(
  cliente: PoolClient,
  documentoId: string,
  unidadId: string,
  actorId: string,
) {
  await cliente.query(
    `INSERT INTO ubicaciones_documento(documento_id,unidad_id,registrado_por,
  oficina_nombre_guardado,ruta_ubicacion_guardada) VALUES($1,
  $2,$3,'','')`,
    [documentoId, unidadId, actorId],
  );
}
