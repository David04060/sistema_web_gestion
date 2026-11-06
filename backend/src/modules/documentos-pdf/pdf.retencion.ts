import { pool } from '../../config/database.js';
import type { AlmacenPdf } from './pdf.storage.js';

/** Conserva vínculo y tarea hasta DELETE + HEAD confirmado. Un rollback tras R2 se reintenta de forma idempotente. */
export async function limpiarRetencionesPdf(almacen: () => AlmacenPdf, limite = 20, id?: string) {
  const c = await pool.connect();
  let eliminados = 0, pendientes = 0;
  try {
    await c.query('BEGIN');
    const candidatos = (await c.query<{ documento_id: string }>(
      `SELECT documento_id::text FROM pdf_retenciones_anulacion WHERE eliminado_en IS NULL
       AND vence_en<=clock_timestamp() AND reintentar_desde<=clock_timestamp()
       AND ($1::bigint IS NULL OR documento_id=$1) ORDER BY vence_en LIMIT $2`,
      [id ?? null, Math.max(1, Math.min(limite, 100))],
    )).rows;
    for (const { documento_id } of candidatos) {
      if (!(await c.query('SELECT id FROM documentos WHERE id=$1 FOR UPDATE SKIP LOCKED', [documento_id])).rowCount) continue;
      const r = (await c.query<{ clave_r2: string; revision: string }>(
        `SELECT r.clave_r2,r.revision FROM pdf_retenciones_anulacion r
         JOIN documentos d ON d.id=r.documento_id AND d.situacion='ANULADO'
         JOIN documentos_pdf p ON p.documento_id=r.documento_id AND p.revision=r.revision AND p.clave_r2=r.clave_r2
         WHERE r.documento_id=$1 AND r.eliminado_en IS NULL AND r.vence_en<=clock_timestamp()
         AND r.reintentar_desde<=clock_timestamp() FOR UPDATE OF r SKIP LOCKED`, [documento_id],
      )).rows[0];
      if (!r) continue;
      try {
        await almacen().eliminar(r.clave_r2);
      } catch {
        await c.query(`UPDATE pdf_retenciones_anulacion SET intentos=intentos+1,
          reintentar_desde=clock_timestamp()+interval '5 minutes' WHERE documento_id=$1`, [documento_id]);
        await c.query("INSERT INTO pdf_eventos(documento_id,accion,revision) VALUES($1,'RETENCION_14_DIAS_PENDIENTE',$2)", [documento_id, r.revision]);
        pendientes++;
        continue;
      }
      // Los errores SQL no se disfrazan de fallo R2: rollback conserva la tarea para el próximo ciclo.
      await c.query('SELECT finalizar_retencion_pdf($1,$2)', [documento_id, r.revision]);
      eliminados++;
    }
    await c.query('COMMIT');
    return { eliminados, pendientes };
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  } finally { c.release(); }
}
