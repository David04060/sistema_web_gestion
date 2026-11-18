import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { pool, verificarBaseDatos } from '../dist/config/database.js';
import { actorActual, documento, permisos, situacionCuentaSQL } from '../dist/shared/documental/nucleo.js';
import { perfilNeon } from '../dist/config/env.js';
import { anular as anularDocumento, detalle, filtros, listar } from '../dist/modules/documentos/documentos.operaciones.js';
import { consultarDashboard } from '../dist/modules/dashboard/dashboard.documental.js';
import { leerRegistrosExcel } from '../dist/modules/documentos/exportacion.repository.js';

assert.equal(perfilNeon, false, 'Esta prueba requiere PostgreSQL local');
await verificarBaseDatos();
after(() => pool.end());

test('Dirección y Secretaría ven el estado de custodia incluso cuando son autores', async () => {
  const casos = [
    [3, 'GUARDADO_DIRECCION'], [4, 'GUARDADO_DIRECCION'],
    [3, 'EN_MESA_DE_PARTES'], [4, 'EN_MESA_DE_PARTES'],
    [3, 'PENDIENTE_DIRECCION'], [4, 'PENDIENTE_DIRECCION'],
    [5, 'PERSONAL', 'EN_MI_OFICINA'],
  ];
  for (const [rol, estado, esperado = estado] of casos) {
    const { rows: [fila] } = await pool.query(
      `SELECT ${situacionCuentaSQL} situacion
       FROM (SELECT 0::bigint id,$1::bigint registrado_por,$3::text situacion
             WHERE $2::smallint IS NOT NULL) d`,
      ['1', rol, estado],
    );
    assert.equal(fila.situacion, esperado, `rol ${rol}, estado ${estado}`);
  }
});

test('una delegación de Dirección impide anular a Secretaría, pero permite corregir', async (t) => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [fila] } = await cliente.query(
      `SELECT d.id::text documento,u.id::text,u.rol_id,u.oficina_id::text,
              d.ambito_id::text,u.activo,e.delegado_por::text direccion
       FROM documentos d JOIN delegaciones_documento e ON e.documento_id=d.id
       JOIN usuarios u ON u.id=d.registrado_por
       JOIN usuarios a ON a.id=e.delegado_por
       WHERE d.situacion='DELEGADO' AND u.rol_id=4 AND u.activo AND a.rol_id=3
         AND e.usuario_indicado_id IS NOT NULL AND NOT documento_periodo_cerrado(d.id)
       ORDER BY d.id LIMIT 1`,
    );
    assert.ok(fila, 'Se requiere un registro existente de Secretaría delegado por Dirección');
    t.diagnostic(`Documento local ${fila.documento}; el intento de escritura se revierte`);
    const d = await documento(cliente, fila, fila.documento);
    assert.equal(permisos(fila, d).corregir, true);
    assert.equal(permisos(fila, d).anular, false);
    await assert.rejects(anularDocumento(fila.id, fila.documento, {
      motivo, revision: d.revision,
    }), { status: 403 });
    const resumen = await detalle(fila.id, fila.documento);
    assert.equal(resumen.documento.permisos.anular, false);
    await prepararActor(cliente, fila.id);
    await assert.rejects(
      anular(cliente, fila.documento),
      { code: '42501' },
    );
  } finally {
    await cliente.query('ROLLBACK');
    cliente.release();
  }
});

const motivo = 'Prueba transaccional local';
const prepararActor = (cliente, id) =>
  cliente.query("SELECT set_config('app.actor_id',$1,true),set_config('app.motivo',$2,true)", [id, motivo]);
const anular = (cliente, id) =>
  cliente.query("UPDATE documentos SET situacion_antes_anulacion=situacion,situacion='ANULADO' WHERE id=$1", [id]);

test('un pendiente existente de Secretaría bloquea anulación al quedar guardado en Dirección', async (t) => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [caso] } = await cliente.query(`
      SELECT d.id::text,d.registrado_por::text secretaria,l.propietario_id::text direccion,l.id::text unidad,
             extract(year FROM d.creado_en AT TIME ZONE 'America/Lima')::int anio,
             extract(month FROM d.creado_en AT TIME ZONE 'America/Lima')::int mes
      FROM documentos d JOIN usuarios s ON s.id=d.registrado_por AND s.activo AND s.rol_id=4
      JOIN miembros_ambito m ON m.ambito_id=d.ambito_id
      JOIN usuarios a ON a.id=m.usuario_id AND a.rol_id=3 AND a.activo
      JOIN unidades_ubicacion l ON l.propietario_id=a.id AND l.activo
      WHERE d.situacion='PENDIENTE_DIRECCION' AND NOT documento_periodo_cerrado(d.id)
      ORDER BY d.id,l.id LIMIT 1`);
    assert.ok(caso, 'Se requiere un documento pendiente de Secretaría y una ubicación activa de Dirección');
    t.diagnostic(`Documento local ${caso.id}; todas las escrituras se revierten`);
    const secretaria = await actorActual(cliente, caso.secretaria);
    const direccion = await actorActual(cliente, caso.direccion);
    await prepararActor(cliente, secretaria.id);
    const previo = await documento(cliente, secretaria, caso.id);
    assert.equal(permisos(secretaria, previo).anular, true);
    for (const actor of [direccion, secretaria]) {
      const lista = await listar(actor.id, filtros.parse({ q: previo.codigo_visible, situacion: 'PENDIENTE_DIRECCION' }));
      assert.ok(lista.documentos.some(d => d.id === caso.id && d.situacion_cuenta === 'PENDIENTE_DIRECCION'));
    }
    await cliente.query('SAVEPOINT antes_decision');
    await anular(cliente, caso.id);
    const { rows: [auditoria] } = await cliente.query(
      'SELECT motivo,actor_id::text FROM auditoria_documental WHERE documento_id=$1 ORDER BY id DESC LIMIT 1', [caso.id],
    );
    assert.deepEqual(auditoria, { motivo, actor_id: secretaria.id });
    await cliente.query('ROLLBACK TO SAVEPOINT antes_decision');
    await prepararActor(cliente, direccion.id);
    await cliente.query(
      'INSERT INTO ubicaciones_documento(documento_id,unidad_id,registrado_por) VALUES ($1,$2,$3)',
      [caso.id, caso.unidad, direccion.id],
    );
    for (const actor of [direccion, secretaria]) {
      assert.equal((await documento(cliente, actor, caso.id)).situacion_cuenta, 'GUARDADO_DIRECCION');
      const panel = await consultarDashboard(cliente, actor);
      assert.ok(panel.estados.some(e => e.situacion === 'GUARDADO_DIRECCION' && e.total > 0));
      const excel = await leerRegistrosExcel(cliente, actor, caso.anio, caso.mes);
      assert.equal(excel.find(d => d.codigo === previo.codigo_visible)?.situacion, 'GUARDADO_DIRECCION');
    }
    const d = await documento(cliente, secretaria, caso.id);
    assert.equal(permisos(secretaria, d).anular, false);
    assert.equal(permisos(secretaria, d).corregir, true);
    await prepararActor(cliente, secretaria.id);
    await cliente.query("UPDATE documentos SET asunto=asunto||' (prueba reversible)' WHERE id=$1", [caso.id]);
    await assert.rejects(anular(cliente, caso.id), { code: '42501' });
  } finally {
    await cliente.query('ROLLBACK');
    cliente.release();
  }
});

test('Dirección conserva la anulación propia y el PDF conserva su vínculo y retención', async (t) => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [caso] } = await cliente.query(`
      SELECT d.id::text,d.registrado_por::text actor
      FROM documentos d JOIN usuarios u ON u.id=d.registrado_por AND u.activo AND u.rol_id=3
      JOIN documentos_pdf p ON p.documento_id=d.id
      JOIN delegaciones_documento e ON e.documento_id=d.id AND e.usuario_indicado_id IS NOT NULL
      WHERE d.situacion='DELEGADO' AND NOT documento_periodo_cerrado(d.id)
      ORDER BY d.id LIMIT 1`);
    assert.ok(caso, 'Se requiere un documento vigente propio de Dirección con delegación y PDF');
    t.diagnostic(`Documento local ${caso.id}; todas las escrituras se revierten`);
    const direccion = await actorActual(cliente, caso.actor);
    assert.equal(permisos(direccion, await documento(cliente, direccion, caso.id)).anular, true);
    await prepararActor(cliente, direccion.id);
    await anular(cliente, caso.id);
    const { rows: [retencion] } = await cliente.query(`
      SELECT r.vence_en - r.anulado_en = interval '14 days' plazo_correcto,
             p.clave_r2 = r.clave_r2 AND p.revision = r.revision pdf_intacto
      FROM documentos_pdf p JOIN pdf_retenciones_anulacion r USING (documento_id)
      WHERE p.documento_id=$1`, [caso.id]);
    assert.deepEqual(retencion, { plazo_correcto: true, pdf_intacto: true });
  } finally {
    await cliente.query('ROLLBACK');
    cliente.release();
  }
});

test('un registro recibido con destino Mesa de Partes no cuenta como pendiente', async (t) => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [caso] } = await cliente.query(`
      SELECT d.id::text,d.registrado_por::text secretaria,m.usuario_id::text direccion
      FROM documentos d JOIN usuarios s ON s.id=d.registrado_por AND s.activo AND s.rol_id=4
      JOIN miembros_ambito m ON m.ambito_id=d.ambito_id
      JOIN usuarios a ON a.id=m.usuario_id AND a.rol_id=3 AND a.activo
      WHERE d.clasificacion='RECIBIDO' AND d.situacion='PENDIENTE_DIRECCION'
      ORDER BY d.id LIMIT 1`);
    assert.ok(caso);
    const secretaria = await actorActual(cliente, caso.secretaria);
    const direccion = await actorActual(cliente, caso.direccion);
    await prepararActor(cliente, secretaria.id);
    // En esta base no hay registros vigentes de Mesa; el alta solo existe en esta transacción.
    const { rows: [mesa] } = await cliente.query(`
      INSERT INTO documentos(ambito_id,tipo_id,registrado_por,clasificacion,asunto,situacion)
      SELECT ambito_id,tipo_id,registrado_por,clasificacion,'Prueba transaccional Mesa de Partes','EN_MESA_DE_PARTES'
      FROM documentos WHERE id=$1
      RETURNING id::text,codigo_visible,extract(year FROM creado_en AT TIME ZONE 'America/Lima')::int anio,
                extract(month FROM creado_en AT TIME ZONE 'America/Lima')::int mes`, [caso.id]);
    t.diagnostic(`Temporal ${mesa.id}, basado en el documento local ${caso.id}; rollback al cerrar`);
    for (const actor of [direccion, secretaria]) {
      assert.equal((await documento(cliente, actor, caso.id)).situacion_cuenta, 'PENDIENTE_DIRECCION');
      assert.equal((await documento(cliente, actor, mesa.id)).situacion_cuenta, 'EN_MESA_DE_PARTES');
      const panel = await consultarDashboard(cliente, actor);
      assert.ok(panel.estados.some(e => e.situacion === 'EN_MESA_DE_PARTES' && e.total > 0));
      const excel = await leerRegistrosExcel(cliente, actor, mesa.anio, mesa.mes);
      assert.equal(excel.find(d => d.codigo === mesa.codigo_visible)?.situacion, 'EN_MESA_DE_PARTES');
    }
  } finally {
    await cliente.query('ROLLBACK');
    cliente.release();
  }
});
