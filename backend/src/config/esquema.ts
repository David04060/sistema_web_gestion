import type { ClientBase } from 'pg';

/** Sondas compartidas del modelo activo, sin leer filas documentales. */
export async function verificarEsquemaDocumental(cliente: Pick<ClientBase, 'query'>) {
  await cliente.query(
    'SELECT ambito_id,tipo_id,registrado_por,situacion,revision FROM documentos LIMIT 0',
  );
  await cliente.query('SELECT documento_id,periodo_id FROM documentos_oficina LIMIT 0');
  await cliente.query('SELECT id FROM documentos_grupo(NULL::bigint) LIMIT 0');
  await cliente.query('SELECT revision_esperada FROM pdf_cargas LIMIT 0');
  await cliente.query('SELECT documento_id,vence_en,eliminado_en FROM pdf_retenciones_anulacion LIMIT 0');
}
