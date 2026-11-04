import type { ClientBase } from 'pg';

/** Sondas compartidas del modelo activo, sin leer filas documentales. */
export async function verificarEsquemaDocumental(cliente: Pick<ClientBase, 'query'>) {
  await cliente.query(
    'SELECT ambito_id,tipo_id,registrado_por,situacion,revision FROM documentos LIMIT 0',
  );
  await cliente.query('SELECT revision_esperada FROM pdf_cargas LIMIT 0');
}
