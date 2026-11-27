/** Archivo: Comprueba que existen las columnas y funciones SQL que necesita la API, sin leer documentos.
 */
import type { ClientBase } from 'pg';

/** Sondas compartidas del modelo activo, sin leer filas documentales. */
export async function verificarEsquemaDocumental(cliente: Pick<ClientBase, 'query'>) {
  await cliente.query('SELECT ambito_id,tipo_id,registrado_por,situacion,revision FROM documentos LIMIT 0');
  await cliente.query('SELECT documento_id,periodo_id FROM documentos_oficina LIMIT 0');
  await cliente.query('SELECT id FROM documentos_grupo(NULL::bigint) LIMIT 0');
  const delegaciones = await cliente.query<{ instalada: boolean }>(`
    SELECT to_regprocedure('public.documento_consultable_con_delegacion(bigint,bigint)') IS NOT NULL
       AND to_regprocedure('public.documento_delegado_por(bigint,bigint)') IS NOT NULL
       AND to_regprocedure('public.documento_tiene_relacion_consultable(bigint,bigint)') IS NOT NULL instalada
  `);
  if (!delegaciones.rows[0]?.instalada)
    throw new Error('Falta aplicar database/changes/011-consulta-delegaciones.sql en la base configurada');
  // La ampliación 016 debe estar instalada antes de habilitar las rutas de atención.
  await cliente.query('SELECT id,documento_id,responsable_id,revision FROM acciones_documento LIMIT 0');
  await cliente.query('SELECT id,documento_id FROM acciones_pdf_cargas LIMIT 0');
  await cliente.query('SELECT id FROM delegaciones_documento LIMIT 0');
  await cliente.query('SELECT revision_esperada FROM pdf_cargas LIMIT 0');
  await cliente.query('SELECT documento_id,vence_en,eliminado_en FROM pdf_retenciones_anulacion LIMIT 0');
}
