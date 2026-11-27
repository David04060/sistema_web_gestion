/** Archivo: Retira de R2 los archivos sin vínculo vigente y conserva una tarea para reintentar los fallos.
 */
import { pool } from '../../config/database.js';
import { prefijoPdf, type AlmacenPdf } from './pdf.storage.js';
import { perfilNeon } from '../../config/env.js';
import { HttpError } from '../../shared/http/HttpError.js';

/**
 * Recolecta solo claves sin vínculo vigente; bloquea documento antes de objetos y deja reintento
 * durable ante fallos de R2.
 */
export async function limpiarObjetosPdf(almacen: () => AlmacenPdf, limite = 20, id?: string) {
  // Producción nunca recoge objetos del prefijo QA heredado ni de otros entornos.
  const prefijo = perfilNeon ? prefijoPdf() : null;
  if (perfilNeon && (!prefijo || prefijo.startsWith('qa/') || prefijo.startsWith('tmp/')))
    throw new HttpError(503, 'Prefijo PDF productivo no configurado');
  const cliente = await pool.connect();
  let eliminados = 0,
    pendientes = 0;
  try {
    await cliente.query('BEGIN');
    const candidatos = (
      await cliente.query(
        `SELECT DISTINCT documento_id::text FROM pdf_objetos_pendientes WHERE eliminado_en IS NULL AND
  limpiar_desde<=clock_timestamp() AND ($1::bigint IS NULL OR documento_id=$1)
  AND ($3::text IS NULL OR starts_with(clave_r2,$3) OR starts_with(clave_r2,'tmp/'||$3)) LIMIT $2`,
        [id ?? null, Math.min(limite, 100), prefijo],
      )
    ).rows;
    for (const doc of candidatos) {
      if (
        !(
          await cliente.query('SELECT id FROM documentos WHERE id=$1 FOR UPDATE SKIP LOCKED', [
            doc.documento_id,
          ])
        ).rowCount
      )
        continue;
      const objetos = (
        await cliente.query(
          `SELECT
  o.clave_r2
FROM
  pdf_objetos_pendientes o
WHERE
  o.documento_id = $1
  AND o.eliminado_en IS NULL
  AND o.limpiar_desde <= clock_timestamp()
  AND NOT EXISTS (
    SELECT
      1
    FROM
      documentos_pdf p
    WHERE
      p.clave_r2 = o.clave_r2)
  AND NOT EXISTS (SELECT 1 FROM acciones_documento a WHERE a.pdf_clave=o.clave_r2)
  AND ($3::text IS NULL
    OR starts_with (o.clave_r2, $3)
    OR starts_with (o.clave_r2, 'tmp/' || $3))
ORDER BY
  o.clave_r2
LIMIT $2
FOR UPDATE
  OF o SKIP LOCKED`,
          [doc.documento_id, limite, prefijo],
        )
      ).rows;
      for (const objeto of objetos) {
        let accion = 'LIMPIEZA_COMPLETADA';
        try {
          await almacen().eliminar(objeto.clave_r2);
          await cliente.query(
            'UPDATE pdf_objetos_pendientes SET eliminado_en=clock_timestamp(),intentos=intentos+1 WHERE clave_r2=$1',
            [objeto.clave_r2],
          );
          eliminados++;
        } catch {
          accion = 'LIMPIEZA_PENDIENTE';
          await cliente.query(
            `UPDATE
  pdf_objetos_pendientes
SET
  intentos = intentos + 1,
  limpiar_desde = clock_timestamp() + interval '1 minute'
WHERE
  clave_r2 = $1`,
            [objeto.clave_r2],
          );
          pendientes++;
        }
        await cliente.query('INSERT INTO pdf_eventos(documento_id,accion) VALUES($1,$2)', [
          doc.documento_id,
          accion,
        ]);
      }
    }
    await cliente.query('COMMIT');
    return { eliminados, pendientes };
  } catch (e) {
    await cliente.query('ROLLBACK');
    throw e;
  } finally {
    cliente.release();
  }
}
