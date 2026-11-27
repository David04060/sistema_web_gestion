/** Archivo: Consulta documentos, destinos e historia dentro del alcance permitido a la cuenta.
 */
import type { PoolClient } from 'pg';
import type { z } from 'zod';
import { filtros, consultaDestinatarios } from './documental.schema.js';
import { periodoRegistro } from './fecha-registro.js';
import { datosAuditoria } from './auditoria.documental.js';
import {
  operacion,
  documento,
  exigirAmbito,
  lecturaSQL,
  situacionCuentaSQL,
  permisos,
  type Actor,
} from '../../shared/documental/nucleo.js';
import { HttpError } from '../../shared/http/HttpError.js';
import { unidadPropiaActiva } from './ubicacion.reglas.js';

/** Consulta catálogos del ámbito activos. */
export async function opciones(actor: string) {
  return operacion(actor, 'Opciones documentales', async (cliente, identidad) => {
    const ambito = exigirAmbito(identidad);
    return {
      ambito_id: ambito,
      oficina_actual_id: identidad.oficina_id,
      tipos: (
        await cliente.query(
          'SELECT id::text,nombre,prefijo FROM tipos_documentales WHERE ambito_id=$1 AND activo ORDER BY nombre',
          [ambito],
        )
      ).rows,
      oficinas: (await cliente.query('SELECT id::text,nombre FROM oficinas WHERE activa ORDER BY nombre'))
        .rows,
    };
  });
}

/** Sugerencias de origen: consulta acotada y autorización antes de buscar o contar resultados. */
export async function buscarOrigenes(actor: string, q: string) {
  return operacion(actor, 'Buscar documento de origen', async (cliente, identidad) => {
    exigirAmbito(identidad);
    const limite = q ? 20 : 5;
    const filas = (
      await cliente.query(
        `SELECT d.id::text,d.codigo_visible,d.asunto FROM documentos d WHERE ${lecturaSQL}
       AND (d.registrado_por=$1 OR public.documento_delegado_por($1,d.id) IS NOT NULL)
       AND d.situacion<>'ANULADO' AND strpos(lower(concat_ws(' ',d.codigo_visible,d.asunto)),lower($4))>0
       ORDER BY d.creado_en DESC,d.id DESC LIMIT $5`,
        [identidad.id, identidad.rol_id, identidad.ambito_id, q, limite + 1],
      )
    ).rows;
    return { documentos: filas.slice(0, limite), hay_mas: filas.length > limite };
  });
}

/** Recorre el grupo completo; no devuelve claves ni la identidad de intermediarios no consultables. */
async function grupoDocumental(cliente: PoolClient, actor: Actor, id: string) {
  const filas = (
    await cliente.query<{
      id: string;
      codigo_visible: string;
      asunto: string;
      origen_id: string | null;
      creado_en: Date;
      visible: boolean;
    }>(
      `SELECT
  d.id::text,
  d.codigo_visible,
  d.asunto,
  d.creado_en,
  public.documento_consultable_con_delegacion ($1, d.id) visible,
  CASE WHEN public.documento_consultable_con_delegacion ($1, r.origen_id) THEN
    r.origen_id::text
  ELSE
    NULL
  END origen_id
FROM
  public.documentos_grupo ($2) g
  JOIN documentos d ON d.id = g.id
  LEFT JOIN documentos_relaciones r ON r.documento_id = d.id
ORDER BY
  d.creado_en,
  d.id`,
      [actor.id, id],
    )
  ).rows;
  const primero = filas[0];
  return {
    primero_id: primero?.visible ? primero.id : null,
    inicio_visible: primero?.visible ?? false,
    documentos: filas.filter((f) => f.visible).map(({ visible: _visible, ...d }) => d),
  };
}

/** Recorre ramas activas de la cuenta autenticada y limita los resultados en PostgreSQL. */
export async function buscarUbicaciones(
  actor: string,
  filtro: string | { q: string; nivel?: 'estantes'; estante_id?: string },
) {
  return operacion(actor, 'Buscar ubicación', async (cliente, identidad) => {
    exigirAmbito(identidad);
    const { q, nivel, estante_id } =
      typeof filtro === 'string' ? { q: filtro, nivel: undefined, estante_id: undefined } : filtro;
    const limite = q ? 20 : 5;
    const { rows } = await cliente.query<{ id: string; ruta: string }>(
      `WITH RECURSIVE lugares AS (
  SELECT
    u.id,
    CASE WHEN u.clase = 'Lugar' THEN
      u.nombre
    ELSE
      u.clase || ': ' || u.nombre
    END AS ruta,
    u.clase,
    u.nombre,
    u.padre_id,
    u.id raiz_id,
    false AS contenido
  FROM
    unidades_ubicacion u
    JOIN oficinas o ON o.id = u.oficina_id
      AND o.activa
  WHERE
    ${unidadPropiaActiva}
    AND u.padre_id IS NULL
  UNION ALL
  SELECT
    u.id,
    l.ruta || ' › ' || u.nombre,
    u.clase,
    u.nombre,
    u.padre_id,
    l.raiz_id,
    true
  FROM
    lugares l
    JOIN unidades_ubicacion u ON u.padre_id = l.id
  WHERE
    ${unidadPropiaActiva}
),
etiquetas AS (
  SELECT
    id,
    clase,
    nombre,
    padre_id,
    raiz_id,
    contenido,
    CASE WHEN contenido THEN
      ruta || ' · ' || clase
    ELSE
      ruta
    END AS ruta
  FROM
    lugares
)
SELECT
  id::text,
  ruta,
  clase,
  nombre,
  padre_id::text,
  raiz_id::text
FROM
  etiquetas
WHERE ($5::text IS NULL
  OR NOT contenido)
AND ($6::bigint IS NULL
  OR (raiz_id = $6
    AND contenido))
AND strpos(translate(lower(ruta), 'áéíóúü', 'aeiouu'), translate(lower($3),
  'áéíóúü', 'aeiouu')) > 0
ORDER BY
  ruta,
  etiquetas.id
LIMIT $4`,
      [identidad.id, identidad.oficina_id, q, limite + 1, nivel ?? null, estante_id ?? null],
    );
    return { ubicaciones: rows.slice(0, limite), hay_mas: rows.length > limite };
  });
}
/**
 * Aplica lectura autorizada antes de contar y paginar; los anulados exigen petición expresa del
 * Superadministrador.
 * @param actor ID obtenido del JWT revalidado, nunca del filtro de búsqueda.
 * @param f Filtros validados; la fecha usa el calendario de America/Lima.
 * @returns Documentos visibles, total y paginación del mismo conjunto SQL.
 */
export async function listar(actor: string, f: z.infer<typeof filtros>) {
  return operacion(actor, 'Consulta', async (cliente, identidad) => {
    if (f.situacion === 'ANULADO' && identidad.rol_id !== 1)
      throw new HttpError(403, 'Solo Superadministrador consulta anulados');
    const periodo = periodoRegistro(f.fecha);
    const valores = [
      identidad.id,
      identidad.rol_id,
      identidad.ambito_id,
      '%' + f.q.replace(/[\\%_]/g, '\\$&') + '%',
      f.situacion ?? null,
      f.tipo_id ?? null,
      f.clasificacion ?? null,
      f.limite,
      (f.pagina - 1) * f.limite,
      periodo.inicio,
      periodo.intervalo,
      f.con_relacionados ?? false,
    ];
    const base = `FROM documentos d WHERE ${lecturaSQL}
 AND ($2::smallint<>1 OR $5::text IS NOT NULL OR d.situacion<>'ANULADO')
  AND concat_ws(' ',d.codigo_visible,d.asunto,d.remitente) ILIKE $4 ESCAPE E'\\\\' AND ($5::text
  IS NULL OR CASE WHEN $5='DELEGADO' THEN d.situacion=$5
    ELSE (${situacionCuentaSQL})=$5 END) AND ($6::bigint IS NULL OR d.tipo_id=$6) AND ($7::text IS NULL
  OR d.clasificacion=$7) AND ($10::date IS NULL OR (d.creado_en>=($10::date::timestamp AT TIME
  ZONE 'America/Lima') AND d.creado_en<(($10::date+$11::interval) AT TIME ZONE 'America/Lima')))
  AND (NOT $12::boolean OR public.documento_tiene_relacion_consultable($1,d.id))`;
    const r = await cliente.query(
      `WITH visibles AS (
  SELECT
    to_jsonb (d) || jsonb_build_object(
      'id', d.id::text,
      'ambito_id', d.ambito_id::text,
      'tipo_id', d.tipo_id::text,
      'registrado_por', d.registrado_por::text,
      'ubicacion_ruta', (
        SELECT
          l.ruta_ubicacion_guardada
        FROM ubicaciones_documento l
        WHERE
          l.documento_id = d.id
          AND l.vigente),
      'revision', d.revision::text,
      'situacion_cuenta', (${situacionCuentaSQL}),
      'delegado_por_nombre', public.documento_delegado_por ($1, d.id),
      'registrado_por_oficina', (
        SELECT
          o.nombre
        FROM documentos_oficina h
        JOIN oficina_periodos p ON p.id = h.periodo_id
        JOIN oficinas o ON o.id = p.oficina_id
        WHERE
          h.documento_id = d.id),
      'registrado_por_nombre', (
        SELECT
          concat_ws(' ', u.nombre, u.apellido)
        FROM usuarios u
        WHERE
          u.id = d.registrado_por)
    ) fila,
    d.id orden,
    d.creado_en ${base}
)
SELECT
  (
    SELECT
      count(*)::int
    FROM
      visibles) total,
  coalesce((
    SELECT
      jsonb_agg(v.fila)
    FROM (
    SELECT
      fila
    FROM visibles
    ORDER BY
      creado_en DESC, orden DESC
    LIMIT $8 OFFSET $9) v), '[]'::jsonb) documentos`,
      valores,
    );
    return { ...r.rows[0], pagina: f.pagina, limite: f.limite };
  });
}
/** Revalida lectura del documento y de cada relacionado, sin transferir autoría por delegación.
 * @param actor Cuenta autenticada para la que se calculan situación y acciones disponibles.
 * @param documentoId ID bigint representado como texto.
 * @returns Detalle, destino, ubicación, relaciones y permisos vigentes; no expone claves R2.
 * @throws HttpError 404 si no existe o la cuenta carece de lectura.
 */
export async function detalle(actor: string, documentoId: string) {
  return operacion(actor, 'Consulta', async (cliente, identidad) => {
    const d = await documento(cliente, identidad, documentoId);
    const destino =
      (
        await cliente.query(
          `SELECT e.*,e.usuario_indicado_id::text,e.oficina_indicada_id::text,
  concat_ws(' ',u.nombre,u.apellido) actor FROM delegaciones_documento e JOIN usuarios u ON
  u.id=e.delegado_por WHERE documento_id=$1
  ORDER BY (e.usuario_indicado_id=$2) DESC NULLS LAST,e.delegado_en DESC,e.id DESC LIMIT 1`,
          [documentoId, identidad.id],
        )
      ).rows[0] ?? null;
    // Conserva la ruta guardada y calcula la ruta del catálogo actual; un cambio de nombre no reescribe la historia.
    const lugar =
      (
        await cliente.query(
          `SELECT
  unidad_id::text,
  oficina_nombre_guardado,
  ruta_ubicacion_guardada,
  registrado_en,
  ( WITH RECURSIVE cadena AS (
      SELECT
        u.id,
        u.padre_id,
        u.clase,
        u.nombre,
        0 profundidad
      FROM
        unidades_ubicacion u
      WHERE
        u.id = unidad_id
      UNION ALL
      SELECT
        p.id,
        p.padre_id,
        p.clase,
        p.nombre,
        c.profundidad + 1
      FROM
        cadena c
        JOIN unidades_ubicacion p ON p.id = c.padre_id
    )
    SELECT
      jsonb_agg(
        jsonb_build_object(
          'id', id::text,
          'clase', clase,
          'nombre', nombre
        )
        ORDER BY profundidad DESC
      )
    FROM
      cadena) partes,
  ( WITH RECURSIVE cadena AS (
      SELECT
        u.id,
        u.padre_id,
        u.clase,
        u.nombre,
        0 profundidad
      FROM
        unidades_ubicacion u
      WHERE
        u.id = unidad_id
      UNION ALL
      SELECT
        p.id,
        p.padre_id,
        p.clase,
        p.nombre,
        c.profundidad + 1
      FROM
        cadena c
        JOIN unidades_ubicacion p ON p.id = c.padre_id
    )
    SELECT
      string_agg(
        CASE WHEN padre_id IS NULL
          AND clase <> 'Lugar' THEN
          clase || ': ' || nombre
        ELSE
          nombre
        END, ' / ' ORDER BY profundidad DESC)
    FROM
      cadena) ruta_catalogo
  FROM
    ubicaciones_documento
WHERE
  documento_id = $1
  AND vigente`,
          [documentoId],
        )
      ).rows[0] ?? null;
    const grupo = await grupoDocumental(cliente, identidad, documentoId);
    const relacionados = grupo.documentos.filter((r) => r.id !== documentoId);
    return {
      documento: {
        ...d,
        delegacion: destino,
        ubicacion: lugar,
        relacionados,
        grupo,
        permisos: permisos(identidad, d),
      },
    };
  });
}
/** Exige lectura del documento; el acceso como destinatario devuelve una historia vacía. */
export async function historial(actor: string, documentoId: string) {
  return operacion(actor, 'Consulta', async (cliente, identidad) => {
    const d = await documento(cliente, identidad, documentoId);
    if (d.delegado_por_nombre) return { historial: [] };
    return {
      historial: (
        await cliente.query(
          `SELECT h.id::text,h.accion,h.motivo,h.anterior,h.posterior,h.fecha,
  h.actor_id::text,concat_ws(' ',u.nombre,u.apellido) actor FROM auditoria_documental h JOIN
  usuarios u ON u.id=h.actor_id WHERE documento_id=$1 ORDER BY h.fecha,
  h.id`,
          [documentoId],
        )
      ).rows,
    };
  });
}
/** Busca por nombre con límite fijo y devuelve oficina y cuenta para distinguir homónimos. */
export async function buscarDestinatarios(actor: string, filtro: z.infer<typeof consultaDestinatarios>) {
  return operacion(actor, 'Buscar destinatarios', async (cliente, identidad) => {
    exigirAmbito(identidad);
    const limite = filtro.q ? 20 : 8;
    const resultado = await cliente.query(
      `WITH recientes AS (
         SELECT usuario_indicado_id, max(delegado_en) ultima
         FROM delegaciones_documento
         WHERE $1='' AND delegado_por=$3 AND usuario_indicado_id IS NOT NULL
         GROUP BY usuario_indicado_id
       ), elegibles AS (
         SELECT u.id,u.nombre,u.apellido,u.nombre_usuario,o.nombre oficina,r.ultima
         FROM usuarios u
         JOIN roles rol ON rol.id=u.rol_id
         LEFT JOIN oficinas o ON o.id=u.oficina_id
         LEFT JOIN recientes r ON r.usuario_indicado_id=u.id
         WHERE u.activo AND rol.codigo NOT IN ('ADMINISTRADOR','SUPERADMINISTRADOR')
           AND ($2::bigint IS NULL OR u.oficina_id=$2)
           AND ($1='' OR strpos(lower(concat_ws(' ',u.nombre,u.apellido)),lower($1))>0
             OR strpos(lower(u.nombre_usuario),lower($1))>0)
       )
       SELECT id::text,concat_ws(' ',nombre,apellido) nombre,nombre_usuario,oficina
       FROM elegibles
       WHERE ultima IS NOT NULL OR NOT EXISTS (SELECT 1 FROM elegibles WHERE ultima IS NOT NULL)
       ORDER BY ultima DESC NULLS LAST,nombre,apellido,id LIMIT $4`,
      [filtro.q, filtro.oficina_id ?? null, identidad.id, limite + 1],
    );
    return { personas: resultado.rows.slice(0, limite), hay_mas: resultado.rows.length > limite };
  });
}
/** Proyecta solo cambios públicos y eventos de limpieza PDF; evita exponer JSON interno o claves R2. */
export async function auditoria(actor: string, documentoId: string) {
  return operacion(actor, 'Auditoría documental', async (cliente, identidad) => {
    const d = await documento(cliente, identidad, documentoId);
    if (d.delegado_por_nombre) return { eventos: [] };
    const filas = (
      await cliente.query(
        `SELECT
  'doc:' || h.id::text id,
  h.accion,
  h.motivo,
  h.anterior,
  h.posterior,
  h.fecha,
  concat_ws(' ', u.nombre, u.apellido) actor
FROM
  auditoria_documental h
  JOIN usuarios u ON u.id = h.actor_id
WHERE
  h.documento_id = $1
UNION ALL
SELECT
  'pdf:' || p.id::text,
  'PDF_' || p.accion,
  CASE WHEN p.accion LIKE 'RETENCION_14_DIAS_%' THEN
    'Política automática: PDF de registro anulado, retención de 14 días'
  ELSE
    NULL
  END,
  NULL,
  NULL,
  p.fecha,
  CASE WHEN u.id IS NULL THEN
    NULL
  ELSE
    concat_ws(' ', u.nombre, u.apellido)
  END
FROM
  pdf_eventos p
  LEFT JOIN usuarios u ON u.id = p.actor_id
WHERE
  p.documento_id = $1
  AND p.accion IN ('LIMPIEZA_PENDIENTE', 'LIMPIEZA_COMPLETADA',
    'RETENCION_14_DIAS_PENDIENTE', 'RETENCION_14_DIAS_ELIMINADA')
ORDER BY
  fecha,
  id`,
        [documentoId],
      )
    ).rows;
    return {
      eventos: filas.map((h) => ({
        id: h.id,
        accion: h.accion,
        actor: h.actor,
        fecha: h.fecha,
        motivo: h.motivo,
        datos: datosAuditoria(h.anterior, h.posterior),
      })),
    };
  });
}
