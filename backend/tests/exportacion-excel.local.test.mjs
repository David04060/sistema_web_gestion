/** Archivo: Comprueba alcance, filtros mensuales y contenido de Excel con PostgreSQL temporal.
 */
import './helpers/exigir-aislamiento.mjs';
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import ExcelJS from 'exceljs';
import { Buffer } from 'node:buffer';
import { app } from '../dist/app.js';
import { pool } from '../dist/config/database.js';
import { generarToken } from '../dist/shared/security/jwt.js';
import { leerRegistrosExcel } from '../dist/modules/documentos/exportacion.repository.js';
import { clienteConLecturaSintetica } from './helpers/lectura-sintetica.mjs';

test('API Excel real: cinco perfiles, autorización, filas independientes, vacío y conservación', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const huellas = async () => {
    const h = {};
    for (const t of [
      'usuarios',
      'documentos',
      'documentos_pdf',
      'auditoria_documental',
      'auditoria_configuracion',
      'pdf_cargas',
    ])
      h[t] = (
        await pool.query(
          `SELECT
  count(*)::int total,
  md5(coalesce(string_agg(to_jsonb (x)::text, '' ORDER BY to_jsonb(x)::text),'')) huella FROM ${t} x`,
        )
      ).rows[0];
    return h;
  };
  try {
    const antes = await huellas(),
      actores = (
        await pool.query(
          `SELECT DISTINCT ON (u.rol_id)
  u.id::text,
  u.rol_id,
  u.version_autenticacion,
  m.ambito_id::text
FROM
  usuarios u
  LEFT JOIN miembros_ambito m ON m.usuario_id = u.id
WHERE
  u.activo
ORDER BY
  u.rol_id,
  u.id`,
        )
      ).rows;
    assert.equal(actores.length, 5);
    const periodos = (
      await pool.query(
        `SELECT DISTINCT
  to_char(creado_en AT TIME ZONE 'America/Lima', 'YYYY') anio,
  to_char(creado_en AT TIME ZONE 'America/Lima', 'MM') mes
FROM
  documentos
ORDER BY
  anio,
  mes`,
      )
    ).rows;
    assert.equal((await fetch(base + '/api/documentos/exportar-excel?anio=2026&mes=11')).status, 401);
    for (const a of actores) {
      const headers = { Authorization: 'Bearer ' + generarToken(a.id, a.version_autenticacion) };
      const vacia = await fetch(base + '/api/documentos/exportar-excel?anio=1900&mes=01', { headers });
      if (a.rol_id === 2) {
        assert.equal(vacia.status, 403);
        continue;
      }
      assert.equal(vacia.status, 200);
      assert.equal(vacia.headers.get('x-export-total'), '0');
      const v = new ExcelJS.Workbook();
      await v.xlsx.load(Buffer.from(await vacia.arrayBuffer()));
      assert.equal(v.getWorksheet('Documentos').rowCount, 1);
      for (const p of periodos) {
        const r = await fetch(base + `/api/documentos/exportar-excel?anio=${p.anio}&mes=${p.mes}`, {
          headers,
        });
        assert.equal(r.status, 200);
        assert.match(r.headers.get('content-type'), /spreadsheetml/);
        assert.match(r.headers.get('cache-control'), /no-store/);
        assert.match(
          r.headers.get('content-disposition'),
          new RegExp(`documentos-${p.anio}-${p.mes}\\.xlsx`),
        );
        const esperado = (
          await pool.query(
            `SELECT
  d.id::text,
  d.codigo_visible,
  d.tipo_nombre_guardado,
  d.asunto,
  CASE WHEN d.situacion = 'DELEGADO'
    AND EXISTS (
      SELECT
        1
      FROM
        delegaciones_documento e
      WHERE
        e.documento_id = d.id
        AND e.delegado_por = $4) THEN
    'DELEGADO_POR_MI'
  WHEN d.situacion = 'DELEGADO'
    AND EXISTS (
      SELECT
        1
      FROM
        delegaciones_documento e
      WHERE
        e.documento_id = d.id
        AND e.usuario_indicado_id = $4) THEN
    'DELEGADO_A_MI'
  WHEN d.situacion = 'DELEGADO' THEN
    CASE WHEN d.registrado_por = $4 THEN
      'EN_MI_OFICINA'
    ELSE
      'PERSONAL'
    END
  WHEN $1::int IN (3, 4)
    AND d.situacion IN ('PENDIENTE_DIRECCION', 'GUARDADO_DIRECCION', 'EN_MESA_DE_PARTES') THEN
    d.situacion
  WHEN d.registrado_por = $4
    AND d.situacion IN ('PERSONAL', 'GUARDADO_DIRECCION', 'EN_MESA_DE_PARTES') THEN
    'EN_MI_OFICINA'
  WHEN d.situacion = 'PERSONAL'
    AND EXISTS (
      SELECT
        1
      FROM
        documentos_oficina ar
        JOIN oficina_periodos p ON p.id = ar.periodo_id
        JOIN oficina_periodos v ON v.oficina_id = p.oficina_id
          AND v.fin IS NULL
      WHERE
        ar.documento_id = d.id
        AND v.usuario_id = $4) THEN
    'EN_MI_OFICINA'
  WHEN d.situacion = 'PERSONAL' THEN
    'PERSONAL'
  ELSE
    d.situacion
  END situacion,
  d.remitente,
  d.observaciones,
  to_char(d.creado_en AT TIME ZONE 'America/Lima', 'YYYY-MM-DD"T"HH24:MI:SS.MS') fecha_local
FROM
  documentos d
WHERE ($1::int = 1
  OR (($1::int = 3
      OR ($1::int = 4
        AND d.ambito_id = $2::bigint))
    AND d.situacion <> 'ANULADO')
  OR ($1::int = 5
    AND d.situacion <> 'ANULADO'
    AND ((d.ambito_id = $2::bigint
        AND d.registrado_por = $4)
      OR EXISTS (
        SELECT
          1
        FROM
          delegaciones_documento e
        WHERE
          e.documento_id = d.id
          AND e.usuario_indicado_id = $4))))
AND to_char(d.creado_en AT TIME ZONE 'America/Lima', 'YYYY-MM') = $3
ORDER BY
  d.creado_en,
  d.id`,
            [a.rol_id, a.ambito_id, p.anio + '-' + p.mes, a.id],
          )
        ).rows;
        const w = new ExcelJS.Workbook();
        await w.xlsx.load(Buffer.from(await r.arrayBuffer()));
        const hoja = w.getWorksheet('Documentos');
        assert.equal(Number(r.headers.get('x-export-total')), esperado.length);
        assert.equal(hoja.rowCount, esperado.length + 1);
        for (let i = 0; i < esperado.length; i++) {
          assert.equal(hoja.getCell(i + 2, 1).value, esperado[i].codigo_visible);
          assert.equal(hoja.getCell(i + 2, 3).value, esperado[i].asunto);
          assert.equal(
            hoja.getCell(i + 2, 8).value,
            {
              EN_MI_OFICINA: 'En mi oficina',
              DELEGADO_POR_MI: 'Delegado por mí',
              DELEGADO_A_MI: 'Delegado a mí',
              ANULADO: 'Anulado',
              PERSONAL: 'Personal',
              PENDIENTE_DIRECCION: 'Pendiente de Dirección',
              EN_MESA_DE_PARTES: 'En Mesa de Partes',
              GUARDADO_DIRECCION: 'Guardado en Dirección',
            }[esperado[i].situacion],
          );
        }
        for (let i = 0; i < esperado.length; i++) {
          const e = esperado[i],
            fila = hoja.getRow(i + 2);
          assert.equal(fila.getCell(2).value, e.tipo_nombre_guardado);
          assert.equal(fila.getCell(5).value, e.remitente ?? null);
          assert.equal(fila.getCell(6).value, e.observaciones ?? null);
          assert.equal(fila.getCell(9).value.toISOString(), e.fecha_local + 'Z');
          const pdf = (
            await pool.query(
              'SELECT nombre,tamano_bytes,tipo_mime FROM documentos_pdf WHERE documento_id=$1',
              [e.id],
            )
          ).rows[0];
          assert.equal(fila.getCell(20).value, pdf?.nombre ?? null);
          assert.equal(fila.getCell(21).value, pdf?.tamano_bytes ?? null);
          assert.equal(fila.getCell(22).value, pdf?.tipo_mime ?? null);
        }
        for (const prohibido of ['clave_r2', 'ambito_id', 'documento_id', 'revision', 'contraseña'])
          assert.ok(!hoja.getRow(1).values.some((v) => String(v).includes(prohibido)));
        const pagina = await (await fetch(base + '/api/documentos?limite=1', { headers })).json();
        if (esperado.length > 1) assert.ok(hoja.rowCount - 1 > pagina.documentos.length);
      }
      for (const q of ['anio=2026&mes=13', 'anio=2026&mes=11&rol=1', 'anio=2026&anio=2027&mes=11'])
        assert.equal((await fetch(base + '/api/documentos/exportar-excel?' + q, { headers })).status, 400);
    }
    assert.deepEqual(await huellas(), antes);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test(
  'SQL de exportación pg_temp: volumen/calendario con lectura sintética explícita; ' +
    'permisos reales comprobados por HTTP',
  async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(
        `CREATE TEMP TABLE documentos (
  id bigint,
  ambito_id bigint,
  registrado_por bigint,
  situacion text,
  codigo_visible text,
  tipo_nombre_guardado text,
  asunto text,
  clasificacion text,
  remitente text,
  observaciones text,
  creado_en timestamptz,
  actualizado_en timestamptz
) ON COMMIT DROP`,
      );
      await c.query(
        'CREATE TEMP TABLE usuarios(id bigint,nombre text,apellido text,oficina_id bigint) ON COMMIT DROP',
      );
      await c.query('CREATE TEMP TABLE oficinas(id bigint,nombre text) ON COMMIT DROP');
      await c.query(
        `CREATE TEMP TABLE ubicaciones_documento (
  documento_id bigint,
  vigente boolean,
  oficina_nombre_guardado text,
  ruta_ubicacion_guardada text,
  registrado_en timestamptz
) ON COMMIT DROP`,
      );
      await c.query(
        `CREATE TEMP TABLE delegaciones_documento (
  documento_id bigint,
  usuario_indicado_id bigint,
  oficina_indicada_id bigint,
  delegado_por bigint,
  nombre_persona_guardado text,
  delegado_en timestamptz,
  observaciones text
) ON COMMIT DROP`,
      );
      await c.query(
        `CREATE TEMP TABLE documentos_pdf (
  documento_id bigint,
  nombre text,
  tamano_bytes int,
  tipo_mime text,
  actualizado_en timestamptz
) ON COMMIT DROP`,
      );
      await c.query("INSERT INTO usuarios VALUES(5,'Propio','Personal',NULL),(6,'Ajeno','Privado',NULL)");
      await c.query(
        `INSERT INTO documentos
SELECT
  n,
  20,
  5,
  'PERSONAL',
  'INF' || n,
  'Informe',
  'Original',
  'RECIBIDO',
  NULL,
  NULL,
  '2026-11-10T12:00:00Z',
  '2026-11-10T12:00:00Z'
FROM
  generate_series(1, 55) n`,
      );
      await c.query(
        `INSERT INTO documentos
VALUES
  (56, 20, 5, 'PERSONAL', 'BORDE1', 'Informe', 'Antes', 'RECIBIDO', NULL,
    NULL, '2026-11-01T04:59:59Z', '2026-11-01T04:59:59Z'),
  (57, 20, 5, 'PERSONAL', 'BORDE2', 'Informe', 'Dentro', 'RECIBIDO',
    NULL, NULL, '2026-12-01T04:59:59Z', '2026-12-01T04:59:59Z'),
  (58, 30, 6, 'PERSONAL', 'PRIVADO', 'Informe', 'Ajeno', 'RECIBIDO',
    NULL, NULL, '2026-11-10T12:00:00Z', '2026-11-10T12:00:00Z'),
  (59, 20, 5, 'ANULADO', 'ANULADO', 'Informe', 'Anulado', 'RECIBIDO',
    NULL, NULL, '2026-11-10T12:00:00Z', '2026-11-10T12:00:00Z')`,
      );
      const a = { id: '5', rol_id: 5, ambito_id: '20', oficina_id: null, activo: true };
      assert.equal((await leerRegistrosExcel(clienteConLecturaSintetica(c), a, 2026, 11)).length, 56);
      await c.query(
        `UPDATE
  pg_temp.documentos
SET
  situacion = 'DELEGADO',
  asunto = 'Corregido en diciembre',
  actualizado_en = '2026-12-02T12:00:00Z'
WHERE
  id = 1`,
      );
      await c.query(
        `INSERT INTO pg_temp.delegaciones_documento
  VALUES (1, NULL, NULL, 5, 'Persona de diciembre', '2026-12-02T12:00:00Z', 'Observación actual')`,
      );
      const filas = await leerRegistrosExcel(clienteConLecturaSintetica(c), a, 2026, 11);
      assert.equal(filas.length, 56);
      assert.equal(filas[0].situacion, 'DELEGADO_POR_MI');
      assert.equal(filas[0].asunto, 'Corregido en diciembre');
      assert.equal(filas[0].delegado, 'Persona de diciembre');
      assert.ok(!filas.some((f) => ['PRIVADO', 'ANULADO', 'BORDE1'].includes(f.codigo)));
      assert.equal(
        (await leerRegistrosExcel(clienteConLecturaSintetica(c), { ...a, id: '1', rol_id: 1 }, 2026, 11))
          .length,
        58,
      );
      await assert.rejects(
        leerRegistrosExcel(clienteConLecturaSintetica(c), { ...a, id: '2', rol_id: 2 }, 2026, 11),
        (e) => e.status === 403,
      );
      await c.query(
        `INSERT INTO pg_temp.documentos
SELECT
  n,
  20,
  5,
  'PERSONAL',
  'M' || n,
  'Informe',
  'Volumen',
  'RECIBIDO',
  NULL,
  NULL,
  '2026-11-10T12:00:00Z',
  '2026-11-10T12:00:00Z'
FROM
  generate_series(100, 10150) n`,
      );
      await assert.rejects(
        leerRegistrosExcel(clienteConLecturaSintetica(c), a, 2026, 11),
        (e) => e.status === 422,
      );
      await c.query('DELETE FROM pg_temp.documentos WHERE id>=100');
      await c.query(
        "UPDATE pg_temp.documentos SET observaciones=repeat('x',400000) WHERE id BETWEEN 1 AND 55",
      );
      await assert.rejects(
        leerRegistrosExcel(clienteConLecturaSintetica(c), a, 2026, 11),
        (e) => e.status === 422 && e.message.includes('16 MiB'),
      );
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  },
);

after(async () => {
  await pool.end();
});
