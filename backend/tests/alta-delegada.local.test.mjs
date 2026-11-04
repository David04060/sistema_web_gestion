import './helpers/exigir-aislamiento.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { leerFixtures, verificarEntornoPrueba } from './helpers/entorno-prueba.mjs';
import { pool } from '../dist/config/database.js';
import { alta, registrar, delegar, listar, filtros, buscarDestinatarios } from '../dist/modules/documentos/documentos.operaciones.js';
import { crearUnidad } from '../dist/modules/usuarios/administracion.operaciones.js';
import { pdfDocumental } from '../dist/modules/documentos-pdf/pdf.documental.js';
import { validarPdf } from '../dist/modules/documentos-pdf/pdf.storage.js';

test('Alta delegada, rollback y PDF de autor con PostgreSQL real y almacenamiento simulado', async () => {
  await verificarEntornoPrueba(pool);
  const fixture = leerFixtures();
  const { director, secretaria, usuario, sinOficina, admin } = fixture.cuentas;
  const destino = { nombre: 'Persona indicada', observaciones: 'Constancia sin entrega física' };
  const entrada = (tipo_id, extra = {}) => alta.parse({
    tipo_id, clasificacion: 'RECIBIDO', asunto: 'Prueba de alta delegada', ...extra,
  });
  const archivo = await PDFDocument.create();
  archivo.addPage();
  const bytes = await archivo.save();
  let fallar = false;
  const servicio = pdfDocumental(() => ({
    subir: async () => 'https://fixture.invalid/carga',
    validarYCopiar: async (_origen, _destino, tamano) => {
      if (fallar) throw new Error('R2 no disponible');
      await validarPdf(bytes, tamano);
    },
    eliminar: async () => {},
  }));
  async function adjuntar(actor, doc, revision = null) {
    const p = await servicio.iniciar(actor.id, doc.id, {
      nombre: 'archivo.pdf', tamano: bytes.length, mime: 'application/pdf', revision,
    });
    return servicio.confirmar(actor.id, doc.id, p.carga);
  }
  try {
    const conteos = async () => (await pool.query(`
      SELECT (SELECT count(*) FROM documentos) documentos,
             (SELECT count(*) FROM delegaciones_documento) delegaciones,
             (SELECT count(*) FROM auditoria_documental) auditoria,
             (SELECT sum(ultimo_numero) FROM correlativos_documentales) correlativos
    `)).rows[0];
    const antes = await conteos();
    await assert.rejects(registrar(usuario.id, entrada(fixture.tipos.usuario, {
      destino: { usuario_id: director.id, oficina_id: secretaria.oficina_id },
    })), (e) => e.status === 400);
    assert.deepEqual(await conteos(), antes);
    await assert.rejects(registrar(secretaria.id, entrada(fixture.tipos.director, { destino })),
      (e) => e.status === 400);
    await assert.rejects(registrar(director.id, entrada(fixture.tipos.director, {
      destino, unidad_id: '1',
    })), (e) => e.status === 400);
    const encontrados = await buscarDestinatarios(usuario.id, { q: 'fixture' });
    assert.ok(encontrados.personas.length > 0 && encontrados.personas.length <= 20);
    assert.ok((await buscarDestinatarios(usuario.id, { q: 'fixture', oficina_id: director.oficina_id }))
      .personas.every((p) => p.id === director.id));
    await assert.rejects(buscarDestinatarios(admin.id, { q: 'fixture' }), (e) => e.status === 403);
    const idsHomonimos = [director.id, secretaria.id];
    const nombresPrevios = (await pool.query(
      'SELECT id::text,nombre,apellido FROM usuarios WHERE id=ANY($1::bigint[])',
      [idsHomonimos],
    )).rows;
    try {
      await pool.query("UPDATE usuarios SET nombre='Nombre Homónimo',apellido='Prueba' WHERE id=ANY($1::bigint[])", [idsHomonimos]);
      const { personas } = await buscarDestinatarios(usuario.id, { q: 'homónimo' });
      assert.equal(personas.length, 2);
      assert.equal(personas[0].nombre, personas[1].nombre);
      assert.notEqual(personas[0].nombre_usuario, personas[1].nombre_usuario);
      assert.notEqual(personas[0].oficina, personas[1].oficina);
    } finally {
      for (const u of nombresPrevios)
        await pool.query('UPDATE usuarios SET nombre=$2,apellido=$3 WHERE id=$1', [u.id, u.nombre, u.apellido]);
    }
    for (const [actor, tipo, conservar] of [
      [director, fixture.tipos.director, false],
      [secretaria, fixture.tipos.director, true],
      [usuario, fixture.tipos.usuario, false],
    ]) {
      for (const clasificacion of ['RECIBIDO', 'EMITIDO']) {
        const { documento } = await registrar(actor.id, entrada(tipo, {
          destino, conservar_en_mesa: conservar, clasificacion,
        }));
        assert.equal(documento.situacion, 'DELEGADO');
        assert.equal(documento.clasificacion, clasificacion);
        assert.equal(documento.delegacion.nombre_persona_guardado, destino.nombre);
        assert.equal(documento.permisos.pdf, true);
        if (clasificacion === 'RECIBIDO') {
          const adjunto = await adjuntar(actor, documento);
          assert.ok(adjunto.archivo.revision);
        }
      }
    }
    for (const [actor, tipo, conservar, situacion] of [
      [director, fixture.tipos.director, false, 'GUARDADO_DIRECCION'],
      [secretaria, fixture.tipos.director, true, 'EN_MESA_DE_PARTES'],
      [usuario, fixture.tipos.usuario, false, 'PERSONAL'],
    ]) {
      const unidad = await crearUnidad(actor.id, { nombre: 'Ubicación de prueba', clase: 'Lugar', padre_id: null });
      const datos = entrada(tipo, { unidad_id: unidad.id, conservar_en_mesa: conservar });
      const { documento: guardado } = await registrar(actor.id, datos);
      const { documento: vecino } = await registrar(actor.id, datos);
      assert.equal(guardado.situacion, situacion);
      assert.ok(guardado.ubicacion);
      assert.equal(guardado.permisos.delegar, true);
      const { documento: delegado } = await delegar(actor.id, guardado.id, {
        ...destino, revision: guardado.revision, usuario_id: null, oficina_id: null,
      });
      assert.equal(delegado.situacion, 'DELEGADO');
      assert.equal(delegado.ubicacion, null);
      assert.equal(delegado.permisos.pdf, true);
      const ubicaciones = (await pool.query(
        'SELECT documento_id::text,vigente FROM ubicaciones_documento WHERE unidad_id=$1 ORDER BY documento_id',
        [unidad.id],
      )).rows;
      assert.deepEqual(ubicaciones, [
        { documento_id: guardado.id, vigente: false }, { documento_id: vecino.id, vigente: true },
      ]);
      const historial = (await pool.query(
        "SELECT anterior,posterior,actor_id::text,fecha FROM auditoria_documental WHERE documento_id=$1 AND accion='DELEGACION'",
        [guardado.id],
      )).rows[0];
      assert.equal(historial.anterior.situacion, situacion);
      assert.equal(historial.anterior.ruta, guardado.ubicacion.ruta_ubicacion_guardada);
      assert.equal(historial.posterior.situacion, 'DELEGADO');
      assert.equal(historial.posterior.ruta, null);
      assert.equal(historial.actor_id, actor.id);
      assert.ok(historial.fecha);
    }
    const { documento: personal } = await registrar(usuario.id, entrada(fixture.tipos.usuario));
    const previo = await adjuntar(usuario, personal);
    const { documento: delegado } = await delegar(usuario.id, personal.id, {
      ...destino, revision: personal.revision, usuario_id: null, oficina_id: null,
    });
    const reemplazo = await adjuntar(usuario, delegado, previo.archivo.revision);
    assert.notEqual(reemplazo.archivo.revision, previo.archivo.revision);
    assert.equal(reemplazo.eliminar, false);
    await pool.query('UPDATE usuarios SET oficina_id=$2 WHERE id=$1', [sinOficina.id, usuario.oficina_id]);
    await assert.rejects(adjuntar(sinOficina, delegado, reemplazo.archivo.revision),
      (e) => [403, 404].includes(e.status));
    assert.equal((await listar(sinOficina.id, filtros.parse({ q: delegado.codigo_visible }))).total, 0);
    const eventos = await pool.query("SELECT actor_id::text,accion FROM pdf_eventos WHERE documento_id=$1 AND accion IN ('CARGA','REEMPLAZO') ORDER BY id", [delegado.id]);
    assert.deepEqual(eventos.rows, [
      { actor_id: usuario.id, accion: 'CARGA' }, { actor_id: usuario.id, accion: 'REEMPLAZO' },
    ]);
    const { documento: sinPdf } = await registrar(usuario.id, entrada(fixture.tipos.usuario, { destino }));
    assert.equal((await servicio.consultar(usuario.id, sinPdf.id)).archivo, null);
    fallar = true;
    await assert.rejects(adjuntar(usuario, sinPdf), /R2 no disponible/);
    assert.equal((await servicio.consultar(usuario.id, sinPdf.id)).archivo, null);
    fallar = false;
    assert.ok((await adjuntar(usuario, sinPdf)).archivo);
  } finally {
    await pool.end();
  }
});
