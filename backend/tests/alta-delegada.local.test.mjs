/** Archivo: Comprueba registro con delegación inicial, destinos compatibles y sugerencias de cuentas.
 */
import './helpers/exigir-aislamiento.mjs';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { leerFixtures, verificarEntornoPrueba } from './helpers/entorno-prueba.mjs';
import { pool } from '../dist/config/database.js';
import {
  alta,
  registrar,
  delegar,
  listar,
  filtros,
  buscarDestinatarios,
  detalle,
  historial,
  auditoria,
  anular,
  corregir,
  ubicar,
} from '../dist/modules/documentos/documentos.operaciones.js';
import { crearUnidad } from '../dist/modules/usuarios/administracion.operaciones.js';
import { pdfDocumental } from '../dist/modules/documentos-pdf/pdf.documental.js';
import { dashboardActual } from '../dist/modules/dashboard/dashboard.documental.js';
import { validarPdf } from '../dist/modules/documentos-pdf/pdf.storage.js';

test('Alta delegada, rollback y PDF de autor con PostgreSQL real y almacenamiento simulado', async () => {
  await verificarEntornoPrueba(pool);
  const fixture = leerFixtures();
  const { director, secretaria, usuario, sinOficina, admin } = fixture.cuentas;
  const destino = { nombre: 'Persona indicada', observaciones: 'Constancia sin entrega física' };
  const entrada = (tipo_id, extra = {}) =>
    alta.parse({
      tipo_id,
      clasificacion: 'RECIBIDO',
      asunto: 'Prueba de alta delegada',
      ...extra,
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
    leer: async () => bytes,
    eliminar: async () => {},
  }));
  async function adjuntar(actor, doc, revision = null) {
    const p = await servicio.iniciar(actor.id, doc.id, {
      nombre: 'archivo.pdf',
      tamano: bytes.length,
      mime: 'application/pdf',
      revision,
    });
    return servicio.confirmar(actor.id, doc.id, p.carga);
  }
  try {
    const conteos = async () =>
      (
        await pool.query(`
      SELECT (SELECT count(*) FROM documentos) documentos,
             (SELECT count(*) FROM delegaciones_documento) delegaciones,
             (SELECT count(*) FROM auditoria_documental) auditoria,
             (SELECT sum(ultimo_numero) FROM correlativos_documentales) correlativos
    `)
      ).rows[0];
    const antes = await conteos();
    await assert.rejects(
      registrar(
        usuario.id,
        entrada(fixture.tipos.usuario, {
          destino: { usuario_id: director.id, oficina_id: secretaria.oficina_id },
        }),
      ),
      (e) => e.status === 400,
    );
    assert.deepEqual(await conteos(), antes);
    await assert.rejects(
      registrar(secretaria.id, entrada(fixture.tipos.director, { destino })),
      (e) => e.status === 400,
    );
    await assert.rejects(
      registrar(
        director.id,
        entrada(fixture.tipos.director, {
          destino,
          unidad_id: '1',
        }),
      ),
      (e) => e.status === 400,
    );
    const encontrados = await buscarDestinatarios(usuario.id, { q: 'fixture' });
    assert.ok(encontrados.personas.length > 0 && encontrados.personas.length <= 20);
    assert.ok(
      (
        await buscarDestinatarios(usuario.id, { q: 'fixture', oficina_id: director.oficina_id })
      ).personas.every((p) => p.id === director.id),
    );
    await assert.rejects(buscarDestinatarios(admin.id, { q: 'fixture' }), (e) => e.status === 403);
    const sugerir = async (actor, oficina_id) =>
      (await buscarDestinatarios(actor.id, { q: '', oficina_id })).personas.map((p) => p.id);
    assert.ok((await sugerir(usuario)).length <= 8);
    for (const receptor of [director, secretaria, director]) {
      await registrar(usuario.id, entrada(fixture.tipos.usuario, { destino: { usuario_id: receptor.id } }));
    }
    await registrar(director.id, entrada(fixture.tipos.director, { destino: { usuario_id: usuario.id } }));
    assert.deepEqual(await sugerir(usuario), [director.id, secretaria.id]);
    assert.equal((await sugerir(director))[0], usuario.id);
    assert.deepEqual(await sugerir(usuario, secretaria.oficina_id), [secretaria.id]);
    await pool.query('UPDATE usuarios SET activo=false WHERE id=$1', [secretaria.id]);
    try {
      assert.deepEqual(await sugerir(usuario), [director.id]);
      await assert.rejects(
        registrar(
          usuario.id,
          entrada(fixture.tipos.usuario, {
            destino: { usuario_id: secretaria.id },
          }),
        ),
        (e) => e.status === 400,
      );
    } finally {
      await pool.query('UPDATE usuarios SET activo=true WHERE id=$1', [secretaria.id]);
    }
    assert.ok((await buscarDestinatarios(usuario.id, { q: 'f' })).personas.some((p) => p.id === director.id));
    const idsHomonimos = [director.id, secretaria.id];
    const nombresPrevios = (
      await pool.query('SELECT id::text,nombre,apellido FROM usuarios WHERE id=ANY($1::bigint[])', [
        idsHomonimos,
      ])
    ).rows;
    try {
      await pool.query(
        "UPDATE usuarios SET nombre='Nombre Homónimo',apellido='Prueba' WHERE id=ANY($1::bigint[])",
        [idsHomonimos],
      );
      const { personas } = await buscarDestinatarios(usuario.id, { q: 'homónimo' });
      assert.equal(personas.length, 2);
      assert.equal(personas[0].nombre, personas[1].nombre);
      assert.notEqual(personas[0].nombre_usuario, personas[1].nombre_usuario);
      assert.notEqual(personas[0].oficina, personas[1].oficina);
    } finally {
      for (const u of nombresPrevios)
        await pool.query('UPDATE usuarios SET nombre=$2,apellido=$3 WHERE id=$1', [
          u.id,
          u.nombre,
          u.apellido,
        ]);
    }
    for (const [actor, tipo, conservar] of [
      [director, fixture.tipos.director, false],
      [secretaria, fixture.tipos.director, true],
      [usuario, fixture.tipos.usuario, false],
    ]) {
      for (const clasificacion of ['RECIBIDO', 'EMITIDO']) {
        const { documento } = await registrar(
          actor.id,
          entrada(tipo, {
            destino,
            conservar_en_mesa: conservar,
            clasificacion,
          }),
        );
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
      const unidad = await crearUnidad(actor.id, {
        nombre: 'Ubicación de prueba',
        clase: 'Lugar',
        padre_id: null,
      });
      const datos = entrada(tipo, { unidad_id: unidad.id, conservar_en_mesa: conservar });
      const { documento: guardado } = await registrar(actor.id, datos);
      const { documento: vecino } = await registrar(actor.id, datos);
      assert.equal(guardado.situacion, situacion);
      assert.ok(guardado.ubicacion);
      assert.equal(guardado.permisos.delegar, true);
      const { documento: delegado } = await delegar(actor.id, guardado.id, {
        ...destino,
        revision: guardado.revision,
        usuario_id: null,
        oficina_id: null,
      });
      assert.equal(delegado.situacion, 'DELEGADO');
      assert.equal(delegado.ubicacion, null);
      assert.equal(delegado.permisos.pdf, true);
      const ubicaciones = (
        await pool.query(
          'SELECT documento_id::text,vigente FROM ubicaciones_documento WHERE unidad_id=$1 ORDER BY documento_id',
          [unidad.id],
        )
      ).rows;
      assert.deepEqual(ubicaciones, [
        { documento_id: guardado.id, vigente: false },
        { documento_id: vecino.id, vigente: true },
      ]);
      const historial = (
        await pool.query(
          `SELECT
  anterior,
  posterior,
  actor_id::text,
  fecha
FROM
  auditoria_documental
WHERE
  documento_id = $1
  AND accion = 'DELEGACION'`,
          [guardado.id],
        )
      ).rows[0];
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
      ...destino,
      revision: personal.revision,
      usuario_id: null,
      oficina_id: null,
    });
    const reemplazo = await adjuntar(usuario, delegado, previo.archivo.revision);
    assert.notEqual(reemplazo.archivo.revision, previo.archivo.revision);
    assert.equal(reemplazo.eliminar, false);
    await assert.rejects(
      pool.query('UPDATE usuarios SET oficina_id=$2 WHERE id=$1', [sinOficina.id, usuario.oficina_id]),
      (e) => e.code === '23505',
    );
    const otraOficina = (
      await pool.query(
        "INSERT INTO oficinas(nombre) VALUES('Otra oficina sintética para aislamiento PDF') RETURNING id::text",
      )
    ).rows[0].id;
    await pool.query('UPDATE usuarios SET oficina_id=$2 WHERE id=$1', [sinOficina.id, otraOficina]);
    await assert.rejects(adjuntar(sinOficina, delegado, reemplazo.archivo.revision), (e) =>
      [403, 404].includes(e.status),
    );
    assert.equal((await listar(sinOficina.id, filtros.parse({ q: delegado.codigo_visible }))).total, 0);
    const eventos = await pool.query(
      `SELECT
  actor_id::text,
  accion
FROM
  pdf_eventos
WHERE
  documento_id = $1
  AND accion IN ('CARGA', 'REEMPLAZO')
ORDER BY
  id`,
      [delegado.id],
    );
    assert.deepEqual(eventos.rows, [
      { actor_id: usuario.id, accion: 'CARGA' },
      { actor_id: usuario.id, accion: 'REEMPLAZO' },
    ]);
    const { documento: sinPdf } = await registrar(usuario.id, entrada(fixture.tipos.usuario, { destino }));
    assert.equal((await servicio.consultar(usuario.id, sinPdf.id)).archivo, null);
    fallar = true;
    await assert.rejects(adjuntar(usuario, sinPdf), /R2 no disponible/);
    assert.equal((await servicio.consultar(usuario.id, sinPdf.id)).archivo, null);
    fallar = false;
    assert.ok((await adjuntar(usuario, sinPdf)).archivo);
    for (const [emisor, tipo] of [
      [director, fixture.tipos.director],
      [secretaria, fixture.tipos.director],
      [usuario, fixture.tipos.usuario],
    ]) {
      let { documento: doc } = await registrar(
        emisor.id,
        entrada(tipo, {
          ...(emisor === secretaria ? { conservar_en_mesa: true } : {}),
        }),
      );
      if (emisor === director) {
        const unidad = await crearUnidad(emisor.id, {
          clase: 'Estante',
          nombre: 'Privado para destinatario',
          padre_id: null,
        });
        ({ documento: doc } = await ubicar(emisor.id, doc.id, {
          revision: doc.revision,
          unidad_id: unidad.id,
        }));
      }
      const adjunto = emisor !== secretaria ? await adjuntar(emisor, doc) : null;
      ({ documento: doc } = await detalle(emisor.id, doc.id));
      ({ documento: doc } = await delegar(emisor.id, doc.id, {
        revision: doc.revision,
        usuario_id: sinOficina.id,
      }));
      const receptor = sinOficina.id;
      for (const [cuenta, etiqueta] of [
        [emisor.id, 'DELEGADO_POR_MI'],
        [receptor, 'DELEGADO_A_MI'],
      ]) {
        const filtro = filtros.parse({ q: doc.codigo_visible, situacion: etiqueta });
        const lista = await listar(cuenta, filtro);
        assert.equal(lista.total, 1);
        assert.equal(lista.documentos[0].situacion, 'DELEGADO');
        assert.equal(lista.documentos[0].situacion_cuenta, etiqueta);
        assert.equal(lista.documentos[0].clasificacion, 'RECIBIDO');
        assert.equal((await detalle(cuenta, doc.id)).documento.situacion_cuenta, etiqueta);
        assert.ok(
          (await dashboardActual(cuenta)).estados.some((e) => e.situacion === etiqueta && e.total > 0),
        );
      }
      const { documentos } = await listar(receptor, filtros.parse({ q: doc.codigo_visible }));
      assert.equal(documentos[0].delegado_por_nombre, doc.registrado_por_nombre);
      const { documento: recibido } = await detalle(receptor, doc.id);
      assert.equal(recibido.registrado_por, emisor.id);
      assert.equal(recibido.ubicacion, null);
      assert.ok(Object.values(recibido.permisos).every((v) => !v));
      assert.deepEqual(await historial(receptor, doc.id), { historial: [] });
      assert.deepEqual(await auditoria(receptor, doc.id), { eventos: [] });
      if (emisor === director)
        assert.match(JSON.stringify(await historial(emisor.id, doc.id)), /Privado para destinatario/);
      await assert.rejects(detalle(admin.id, doc.id), (e) => e.status === 404);
      if (emisor !== usuario) await assert.rejects(detalle(usuario.id, doc.id), (e) => e.status === 404);
      const revision = doc.revision;
      const motivo = 'Comprobación sintética';
      for (const intento of [
        () => corregir(receptor, doc.id, { revision, motivo, asunto: 'Modificación' }),
        () => ubicar(receptor, doc.id, { revision, unidad_id: '1' }),
        () => delegar(receptor, doc.id, { revision, nombre: 'Otra persona' }),
        () => anular(receptor, doc.id, { revision, motivo }),
        () => adjuntar(sinOficina, doc),
        () => servicio.confirmar(receptor, doc.id, '00000000-0000-4000-8000-000000000000'),
        () => servicio.eliminar(receptor, doc.id, adjunto?.archivo.revision),
      ])
        await assert.rejects(intento, (e) => e.status === 403);
      const estado = await servicio.consultar(receptor, doc.id);
      assert.equal(estado.modificar, false);
      assert.equal(estado.eliminar, false);
      if (adjunto) {
        for (const descargar of [false, true]) {
          const resultado = await servicio.abrir(receptor, doc.id, descargar);
          assert.deepEqual(Buffer.from(resultado.contenido, 'base64'), Buffer.from(bytes));
        }
      } else {
        assert.equal(estado.archivo, null);
        await assert.rejects(servicio.abrir(receptor, doc.id, true), (e) => e.status === 404);
      }
      await anular(emisor.id, doc.id, { revision, motivo });
      assert.equal((await listar(receptor, filtros.parse({ q: doc.codigo_visible }))).total, 0);
      await assert.rejects(detalle(receptor, doc.id), (e) => e.status === 404);
      await assert.rejects(servicio.abrir(receptor, doc.id, false), (e) => e.status === 404);
      assert.equal((await detalle(fixture.cuentas.superadmin.id, doc.id)).documento.situacion, 'ANULADO');
    }
    for (const receptor of [director, secretaria]) {
      const { documento: doc } = await registrar(
        usuario.id,
        entrada(fixture.tipos.usuario, {
          clasificacion: 'EMITIDO',
          destino: { usuario_id: receptor.id },
        }),
      );
      const lista = await listar(
        receptor.id,
        filtros.parse({ q: doc.codigo_visible, situacion: 'DELEGADO_A_MI' }),
      );
      assert.equal(lista.total, 1);
      assert.equal(lista.documentos[0].clasificacion, 'EMITIDO');
      const panel = await dashboardActual(receptor.id);
      assert.ok(
        panel.estadisticas.grupos_documentales.some((g) =>
          g.situaciones.some((e) => e.etiqueta === 'DELEGADO_A_MI'),
        ),
      );
    }
  } finally {
    await pool.end();
  }
});
