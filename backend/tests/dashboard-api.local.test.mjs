/** Archivo: Comprueba por HTTP que cada perfil recibe únicamente su resumen permitido.
 */
import './helpers/exigir-aislamiento.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../dist/app.js';
import { pool } from '../dist/config/database.js';
import { generarToken } from '../dist/shared/security/jwt.js';

test('API local: cinco sesiones reales, sin ampliar ámbitos por query y sin cambiar registros', async () => {
  const c = await pool.connect();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const tablas = [
    'usuarios',
    'documentos',
    'documentos_pdf',
    'auditoria_documental',
    'auditoria_configuracion',
    'pdf_cargas',
  ];
  async function huellas() {
    const r = {};
    for (const tabla of tablas)
      r[tabla] = (
        await c.query(
          `SELECT
  count(*)::int total,
  md5(coalesce(string_agg(to_jsonb (t)::text, '' ORDER BY to_jsonb(t)::text),'')) huella FROM ${tabla} t`,
        )
      ).rows[0];
    return r;
  }
  try {
    const antes = await huellas();
    const actores = (
      await c.query(`SELECT DISTINCT ON(u.rol_id) u.id::text,u.rol_id,u.version_autenticacion,m.ambito_id::text
   FROM usuarios u LEFT JOIN miembros_ambito m ON m.usuario_id=u.id WHERE u.activo ORDER BY u.rol_id,u.id`)
    ).rows;
    assert.equal(actores.length, 5);
    assert.equal((await fetch(base + '/api/dashboard')).status, 401);
    for (const a of actores) {
      const token = generarToken(a.id, a.version_autenticacion);
      const response = await fetch(base + '/api/dashboard?rol=Superadministrador&ambito_id=999', {
        headers: { Authorization: 'Bearer ' + token },
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control'), /no-store/);
      const datos = await response.json();
      assert.equal(datos.estadisticas.zona_horaria, 'America/Lima');
      if (a.rol_id === 2) {
        const esperado = (await c.query('SELECT count(*)::int n FROM usuarios WHERE rol_id<>1')).rows[0].n;
        assert.equal(datos.usuarios, esperado);
        assert.equal(datos.alcance, 'administrativo');
        for (const campo of ['documentos', 'estados', 'recientes']) assert.equal(campo in datos, false);
        assert.equal('grupos_documentales' in datos.estadisticas, false);
        assert.ok(!JSON.stringify(datos).includes('Superadministrador'));
      } else {
        const grupos = datos.estadisticas.grupos_documentales;
        const esperado = (
          await c.query(
            `SELECT
  count(*)::int n
FROM
  documentos
WHERE
  $1::smallint = 1
  OR (situacion <> 'ANULADO'
    AND ($1::smallint IN (3, 4)
      OR ambito_id = $2::bigint))`,
            [a.rol_id, a.ambito_id],
          )
        ).rows[0].n;
        if (a.rol_id !== 4)
          assert.equal(
            grupos.reduce((n, g) => n + g.total, 0),
            esperado,
          );
        else
          assert.equal(
            grupos[0].total,
            (
              await c.query(
                "SELECT count(*)::int n FROM documentos WHERE ambito_id=$1 AND situacion<>'ANULADO'",
                [a.ambito_id],
              )
            ).rows[0].n,
          );
        for (const grupo of grupos) {
          assert.equal(grupo.total, grupo.vigentes + grupo.anulados);
          assert.equal(grupo.meses.length, 12);
          assert.equal(
            grupo.tipos.reduce((n, t) => n + t.total, 0),
            grupo.vigentes,
          );
        }
        if (a.rol_id === 5) {
          assert.equal(grupos.length, 1);
          assert.equal(grupos[0].clave, 'personal');
        }
        if (a.rol_id === 3) {
          assert.deepEqual(
            grupos.map((g) => g.clave),
            ['compartido', 'personales_ajenos'],
          );
        }
      }
    }
    assert.deepEqual(await huellas(), antes);
  } finally {
    c.release();
    await new Promise((r) => server.close(r));
    await pool.end();
  }
});
