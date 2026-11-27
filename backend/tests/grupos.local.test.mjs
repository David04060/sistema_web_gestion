/**
 * Archivo: Comprueba relaciones entre documentos, filtros del grupo y privacidad de los registros no
 * visibles.
 */
import './helpers/exigir-aislamiento.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pool } from '../dist/config/database.js';
import { leerFixtures, verificarEntornoPrueba } from './helpers/entorno-prueba.mjs';
import * as docs from '../dist/modules/documentos/documentos.operaciones.js';
import { actorActual } from '../dist/shared/documental/nucleo.js';
import { leerRegistrosExcel } from '../dist/modules/documentos/exportacion.repository.js';

test('Grupos: selector acotado, cadena completa, filtro y privacidad', async () => {
  await verificarEntornoPrueba(pool);
  const f = leerFixtures(),
    a = f.cuentas.usuario;
  try {
    assert.equal(docs.filtros.safeParse({ con_relacionados: 'true' }).success, true);
    const alta = (origen_id) =>
      docs.alta.parse({
        tipo_id: f.tipos.usuario,
        clasificacion: 'RECIBIDO',
        asunto: 'Cadena sintética ' + (origen_id ?? 'inicio'),
        ...(origen_id ? { origen_id } : {}),
      });
    const uno = (await docs.registrar(a.id, alta())).documento;
    const dos = (await docs.registrar(a.id, alta(uno.id))).documento;
    const tres = (await docs.registrar(a.id, alta(dos.id))).documento;
    const aislado = (await docs.registrar(a.id, alta())).documento;
    const detalle = (await docs.detalle(a.id, tres.id)).documento;
    assert.equal(detalle.grupo.primero_id, uno.id);
    assert.deepEqual(
      detalle.grupo.documentos.map((d) => d.id),
      [uno.id, dos.id, tres.id],
    );
    const lista = await docs.listar(a.id, docs.filtros.parse({ con_relacionados: 'true', limite: 1 }));
    assert.equal(lista.total, 3);
    assert.equal(lista.documentos.length, 1);
    assert.ok(!lista.documentos.some((d) => d.id === aislado.id));
    const sugerencias = await docs.buscarOrigenes(a.id, '');
    assert.ok(sugerencias.documentos.length <= 5);
    const buscado = await docs.buscarOrigenes(a.id, uno.codigo_visible);
    assert.ok(buscado.documentos.some((d) => d.id === uno.id));
    const ajeno = await docs.buscarOrigenes(f.cuentas.sinOficina.id, uno.codigo_visible);
    assert.equal(ajeno.documentos.length, 0);
    const institucional = (
      await docs.registrar(
        f.cuentas.director.id,
        docs.alta.parse({
          tipo_id: f.tipos.director,
          clasificacion: 'RECIBIDO',
          asunto: 'Enlace institucional sintético',
          origen_id: tres.id,
        }),
      )
    ).documento;
    assert.equal(institucional.registrado_por, f.cuentas.director.id);
    assert.equal(institucional.ambito_id, f.cuentas.director.ambito_id);
    assert.equal(institucional.grupo.primero_id, uno.id);
    assert.ok(
      !JSON.stringify((await docs.detalle(a.id, tres.id)).documento.grupo).includes(institucional.asunto),
    );
    await assert.rejects(
      docs.registrar(
        f.cuentas.sinOficina.id,
        docs.alta.parse({
          tipo_id: f.tipos.sinOficina,
          clasificacion: 'RECIBIDO',
          asunto: 'Origen privado',
          origen_id: uno.id,
        }),
      ),
      (e) => [403, 404].includes(e.status),
    );
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.actor_id',$1,true)", [a.id]);
      await assert.rejects(
        c.query('INSERT INTO documentos_relaciones(documento_id,origen_id,creado_por) VALUES($1,$2,$3)', [
          uno.id,
          tres.id,
          a.id,
        ]),
      );
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
    const actualDos = (await docs.detalle(a.id, dos.id)).documento;
    await docs.anular(a.id, dos.id, {
      revision: actualDos.revision,
      motivo: 'Intermediario oculto sintético',
    });
    const oculto = (await docs.detalle(a.id, tres.id)).documento;
    assert.deepEqual(
      oculto.grupo.documentos.map((d) => d.id),
      [uno.id, tres.id],
    );
    assert.equal(oculto.grupo.documentos.find((d) => d.id === tres.id).origen_id, null);
    assert.ok(!JSON.stringify(oculto.grupo).includes(dos.asunto));
    assert.equal((await docs.listar(a.id, docs.filtros.parse({ con_relacionados: 'true' }))).total, 2);
    const e = await pool.connect();
    try {
      const identidad = await actorActual(e, a.id);
      const fecha = new Date(uno.creado_en);
      const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: 'numeric',
      }).formatToParts(fecha);
      const val = (t) => Number(partes.find((x) => x.type === t).value);
      const filas = await leerRegistrosExcel(e, identidad, val('year'), val('month'), true);
      assert.ok(filas.some((x) => x.codigo === uno.codigo_visible));
      assert.ok(!filas.some((x) => x.codigo === aislado.codigo_visible));
    } finally {
      e.release();
    }
    const actualUno = (await docs.detalle(a.id, uno.id)).documento;
    await docs.anular(a.id, uno.id, { revision: actualUno.revision, motivo: 'Inicio oculto sintético' });
    const sinInicio = (await docs.detalle(a.id, tres.id)).documento;
    assert.equal(sinInicio.grupo.primero_id, null);
    assert.equal(sinInicio.grupo.inicio_visible, false);
    assert.equal((await docs.listar(a.id, docs.filtros.parse({ con_relacionados: 'true' }))).total, 0);
    assert.equal((await docs.buscarOrigenes(a.id, uno.codigo_visible)).documentos.length, 0);
  } finally {
    await pool.end();
  }
});
