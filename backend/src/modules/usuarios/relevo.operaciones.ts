/** Archivo: Cambia al responsable de una oficina sin trasladar documentos y conserva el origen de los tipos
 * heredados.
 */
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { operacion, exigirAdministracion, auditarConfiguracion } from '../../shared/documental/nucleo.js';
import { HttpError } from '../../shared/http/HttpError.js';
import { idSchema as id } from '../../shared/admin/admin.schema.js';
/** IDs y versiones de ambas cuentas leídas en pantalla; el motivo queda en auditoría. */
export const relevoSchema = z
  .object({
    saliente_id: id,
    reemplazo_id: id,
    version_saliente: z.number().int().nonnegative(),
    version_reemplazo: z.number().int().nonnegative(),
    motivo: z.string().trim().min(1).max(1000),
  })
  .strict();
/** Bloquea la oficina dentro de la transacción de configuración; rechaza IDs inexistentes. */
async function oficinaActual(c: PoolClient, oficina: string) {
  const o = (await c.query('SELECT id::text,nombre,activa FROM oficinas WHERE id=$1 FOR UPDATE', [oficina]))
    .rows[0];
  if (!o) throw new HttpError(404, 'Oficina inexistente');
  return o;
}
/** Devuelve responsable, candidatos compatibles y versiones para confirmar sin sobrescribir cambios. */
export async function opcionesRelevo(actor: string, oficina: string) {
  return operacion(actor, 'Consulta relevo', async (c, identidad) => {
    exigirAdministracion(identidad);
    const o = await oficinaActual(c, oficina);
    const responsable =
      (
        await c.query(
          `SELECT
  id::text,
  concat_ws(' ', nombre, apellido) nombre,
  version_autenticacion
FROM
  usuarios
WHERE
  oficina_id = $1
  AND activo`,
          [oficina],
        )
      ).rows[0] ?? null;
    const rol = o.nombre === 'Dirección' ? 3 : o.nombre === 'Mesa de Partes' ? 4 : 5;
    const candidatos = (
      await c.query(
        `SELECT
  id::text,
  concat_ws(' ', nombre, apellido) nombre,
  version_autenticacion
FROM
  usuarios
WHERE
  rol_id = $2
  AND (oficina_id IS NULL
    OR oficina_id = $1)
  AND id::text IS DISTINCT FROM $3
ORDER BY
  nombre,
  apellido,
  id`,
        [oficina, rol, responsable?.id ?? null],
      )
    ).rows;
    return { responsable, candidatos };
  });
}
/** Reutiliza o copia tipos al ámbito personal entrante y registra su origen.
 * Un conflicto de nombre/prefijo revierte todo el relevo; no mueve documentos ni ubicaciones. */
async function copiarTipos(c: PoolClient, oficina: string, reemplazo: string, actor: string) {
  const amb = (
    await c.query(
      'SELECT m.ambito_id::text,u.rol_id FROM miembros_ambito m JOIN usuarios u ON ' +
        'u.id=m.usuario_id WHERE u.id=$1',
      [reemplazo],
    )
  ).rows[0];
  if (!amb || amb.rol_id !== 5) return;
  const tipos = (
    await c.query(
      `SELECT DISTINCT
  t.id::text,
  t.nombre,
  t.prefijo
FROM
  tipos_documentales t
  JOIN tipos_oficina o ON o.tipo_id = t.id
WHERE
  o.oficina_id = $1
  AND t.activo
  AND t.ambito_id <> $2
ORDER BY
  t.id::text`,
      [oficina, amb.ambito_id],
    )
  ).rows;
  for (const tipo of tipos) {
    if (
      (
        await c.query('SELECT 1 FROM tipos_relevo WHERE origen_id=$1 AND destino_ambito_id=$2', [
          tipo.id,
          amb.ambito_id,
        ])
      ).rowCount
    )
      continue;
    const existentes = (
      await c.query(
        `SELECT
  id::text,
  nombre,
  prefijo,
  activo
FROM
  tipos_documentales
WHERE
  ambito_id = $1
  AND (lower(nombre) = lower($2)
    OR prefijo = $3)
FOR UPDATE`,
        [amb.ambito_id, tipo.nombre, tipo.prefijo],
      )
    ).rows;
    if (existentes.some((t) => !t.activo || t.nombre !== tipo.nombre || t.prefijo !== tipo.prefijo))
      throw new HttpError(
        409,
        'Hay un conflicto de nombres o prefijos de tipos; resuélvelo antes del relevo',
      );
    const propio =
      existentes[0] ??
      (
        await c.query(
          'INSERT INTO tipos_documentales(ambito_id,nombre,prefijo,creado_por) ' +
            'VALUES($1,$2,$3,$4) RETURNING id::text',
          [amb.ambito_id, tipo.nombre, tipo.prefijo, reemplazo],
        )
      ).rows[0];
    await c.query('INSERT INTO tipos_relevo(origen_id,destino_ambito_id,tipo_id) VALUES($1,$2,$3)', [
      tipo.id,
      amb.ambito_id,
      propio.id,
    ]);
    await auditarConfiguracion(
      c,
      { id: actor, rol_id: 0, oficina_id: null, ambito_id: null, activo: true },
      'TIPO_DOCUMENTAL',
      propio.id,
      'HEREDAR_POR_RELEVO',
      null,
      { origen_id: tipo.id, oficina_id: oficina },
    );
  }
}
/** Valida actor administrativo, oficina y versiones de ambas cuentas bajo bloqueo.
 * Desactiva la saliente, activa la entrante y revoca sus sesiones; los triggers cierran
 * y abren periodos. Devuelve confirmación solo tras COMMIT; cualquier conflicto revierte todo. */
export async function relevarOficina(actor: string, oficina: string, datos: z.infer<typeof relevoSchema>) {
  if (datos.saliente_id === datos.reemplazo_id) throw new HttpError(400, 'Selecciona dos cuentas diferentes');
  return operacion(actor, datos.motivo, async (c, identidad) => {
    exigirAdministracion(identidad);
    const o = await oficinaActual(c, oficina);
    if (!o.activa) throw new HttpError(409, 'Oficina inactiva');
    const cuentas = (
      await c.query(
        `SELECT
  id::text,
  rol_id,
  oficina_id::text,
  activo,
  version_autenticacion
FROM
  usuarios
WHERE
  id IN ($1, $2)
ORDER BY
  id
FOR UPDATE`,
        [datos.saliente_id, datos.reemplazo_id],
      )
    ).rows;
    const saliente = cuentas.find((u) => u.id === datos.saliente_id),
      nuevo = cuentas.find((u) => u.id === datos.reemplazo_id);
    if (!saliente || !nuevo || [saliente.rol_id, nuevo.rol_id].some((r) => r < 3))
      throw new HttpError(400, 'Cuentas incompatibles con relevo');
    if (
      saliente.version_autenticacion !== datos.version_saliente ||
      nuevo.version_autenticacion !== datos.version_reemplazo
    )
      throw new HttpError(409, 'Las cuentas cambiaron; vuelve a consultar');
    if (!saliente.activo || saliente.oficina_id !== oficina)
      throw new HttpError(409, 'El responsable vigente cambió');
    if (nuevo.oficina_id !== null && nuevo.oficina_id !== oficina)
      throw new HttpError(409, 'El reemplazo está asignado a otra oficina');
    const rol = o.nombre === 'Dirección' ? 3 : o.nombre === 'Mesa de Partes' ? 4 : 5;
    if (nuevo.rol_id !== rol) throw new HttpError(400, 'El rol del reemplazo no corresponde a esta oficina');
    await c.query(
      'UPDATE usuarios SET activo=false,version_autenticacion=version_autenticacion+1 WHERE id=$1',
      [saliente.id],
    );
    await c.query(
      'UPDATE usuarios SET oficina_id=$2,activo=true,version_autenticacion=version_autenticacion+1 WHERE id=$1',
      [nuevo.id, oficina],
    );
    await copiarTipos(c, oficina, nuevo.id, identidad.id);
    await auditarConfiguracion(
      c,
      identidad,
      'OFICINA',
      oficina,
      'RELEVO',
      { responsable_id: saliente.id },
      { responsable_id: nuevo.id },
    );
    return { actualizado: true };
  });
}
