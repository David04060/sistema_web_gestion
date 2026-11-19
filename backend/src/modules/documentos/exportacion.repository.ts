import type { PoolClient } from 'pg';
import { lecturaSQL, situacionCuentaSQL, type Actor } from '../../shared/documental/nucleo.js';
import { HttpError } from '../../shared/http/HttpError.js';

export const MAX_FILAS_EXCEL = 10000;
export const MAX_BYTES_EXCEL = 16 * 1024 * 1024;
export interface RegistroExcel {
  codigo: string;
  tipo: string;
  asunto: string;
  clasificacion: string | null;
  remitente: string | null;
  observaciones: string | null;
  registrador: string;
  situacion: string;
  registro: Date;
  actualizacion: Date;
  oficina: string | null;
  ubicacion_oficina: string | null;
  ubicacion: string | null;
  ubicacion_fecha: Date | null;
  delegado: string | null;
  delegacion_oficina: string | null;
  delegado_por: string | null;
  delegacion_fecha: Date | null;
  delegacion_observaciones: string | null;
  pdf_nombre: string | null;
  pdf_bytes: number | null;
  pdf_mime: string | null;
  pdf_fecha: Date | null;
}
const condicion = `${lecturaSQL} AND d.creado_en >= (make_date($4::int,$5::int,1)::timestamp AT TIME ZONE 'America/Lima')
 AND d.creado_en < ((make_date($4::int,$5::int,1)+interval '1 month') AT TIME ZONE 'America/Lima')
 AND (NOT $6::boolean OR public.documento_tiene_relacion_consultable($1,d.id))`;
const seleccion = `SELECT d.codigo_visible codigo,d.tipo_nombre_guardado tipo,d.asunto,
  d.clasificacion,d.remitente,d.observaciones,
 concat_ws(' ',u.nombre,u.apellido) registrador,(${situacionCuentaSQL}) situacion,d.creado_en registro,
  d.actualizado_en actualizacion,o.nombre oficina,
 l.oficina_nombre_guardado ubicacion_oficina,l.ruta_ubicacion_guardada ubicacion,
  l.registrado_en ubicacion_fecha,
 e.nombre_persona_guardado delegado,oe.nombre delegacion_oficina,
  CASE WHEN de.id IS NULL THEN NULL ELSE concat_ws(' ',de.nombre,
  de.apellido) END delegado_por,
 e.delegado_en delegacion_fecha,e.observaciones delegacion_observaciones,
 p.nombre pdf_nombre,p.tamano_bytes pdf_bytes,p.tipo_mime pdf_mime,
  p.actualizado_en pdf_fecha
 FROM documentos d JOIN usuarios u ON u.id=d.registrado_por
 LEFT JOIN documentos_oficina h ON h.documento_id=d.id LEFT JOIN oficina_periodos periodo ON periodo.id=h.periodo_id
 LEFT JOIN oficinas o ON o.id=periodo.oficina_id
 LEFT JOIN ubicaciones_documento l ON l.documento_id=d.id AND l.vigente
 LEFT JOIN delegaciones_documento e ON e.documento_id=d.id LEFT JOIN oficinas oe ON oe.id=e.oficina_indicada_id
 LEFT JOIN usuarios de ON de.id=e.delegado_por LEFT JOIN documentos_pdf p ON p.documento_id=d.id
  WHERE ${condicion}`;

/** No pagina ni aplica los filtros visuales; nunca amplía lecturaSQL ni selecciona claves privadas. */
export async function leerRegistrosExcel(
  c: PoolClient,
  a: Actor,
  anio: number,
  mes: number,
  conRelacionados = false,
): Promise<RegistroExcel[]> {
  if (![1, 3, 4, 5].includes(a.rol_id))
    throw new HttpError(403, 'Este perfil no puede exportar documentos');
  const valores = [a.id, a.rol_id, a.ambito_id, anio, mes, conRelacionados];
  const total = Number(
    (
      await c.query(
        `SELECT count(*) n FROM (SELECT d.id FROM documentos d WHERE ${condicion} LIMIT ${MAX_FILAS_EXCEL + 1}) visibles`,
        valores,
      )
    ).rows[0].n,
  );
  if (total > MAX_FILAS_EXCEL)
    throw new HttpError(
      422,
      'El mes supera los 10 000 registros permitidos por archivo. Solicita una exportación asistida; no se han omitido registros.',
    );
  if (!total) return [];
  const bytes = Number(
    (
      await c.query(
        `SELECT coalesce(sum(octet_length(row_to_json(e)::text)),0)::text bytes FROM (${seleccion}) e`,
        valores,
      )
    ).rows[0].bytes,
  );
  if (bytes > MAX_BYTES_EXCEL)
    throw new HttpError(
      422,
      'Los registros del mes exceden el tamaño máximo de exportación (16 MiB de datos). Solicita una exportación asistida; no se genera un archivo parcial.',
    );
  return (await c.query<RegistroExcel>(seleccion + ' ORDER BY d.creado_en,d.id', valores)).rows;
}
