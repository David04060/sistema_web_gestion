import './helpers/exigir-aislamiento.mjs';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import { pool } from '../dist/config/database.js';
import { verificarEntornoPrueba, leerFixtures } from './helpers/entorno-prueba.mjs';
import {
  atencionDocumental,
  accionSchema,
  cargaAccionSchema,
} from '../dist/modules/documentos/atencion.documental.js';
import { limpiarObjetosPdf } from '../dist/modules/documentos-pdf/pdf.limpieza.js';
import { validarPdf } from '../dist/modules/documentos-pdf/pdf.storage.js';
import { PDFDocument } from 'pdf-lib';
import { pdfDocumental } from '../dist/modules/documentos-pdf/pdf.documental.js';
import { operacion } from '../dist/shared/documental/nucleo.js';
import { leerRegistrosExcel } from '../dist/modules/documentos/exportacion.repository.js';
import * as docs from '../dist/modules/documentos/documentos.operaciones.js';

test('Atención: delegaciones sucesivas conservan acceso y clasificación de todos los destinatarios', async () => {
  await verificarEntornoPrueba(pool);
  const f = leerFixtures(),
    a = f.cuentas.director.id,
    b = f.cuentas.sinOficina.id,
    c = f.cuentas.usuario.id;
  try {
    let d = (
      await docs.registrar(
        a,
        docs.alta.parse({
          tipo_id: f.tipos.director,
          clasificacion: 'RECIBIDO',
          asunto: 'Seguimiento sintético',
        }),
      )
    ).documento;
    d = (
      await docs.delegar(
        a,
        d.id,
        docs.delegacion.parse({ revision: d.revision, usuario_id: b, observaciones: 'Preparar informe' }),
      )
    ).documento;
    let recibido = (await docs.detalle(b, d.id)).documento;
    assert.equal(recibido.permisos.delegar, true);
    assert.equal(recibido.permisos.pdf, false);
    assert.equal(recibido.permisos.corregir, false);
    d = (
      await docs.delegar(
        b,
        d.id,
        docs.delegacion.parse({
          revision: recibido.revision,
          usuario_id: c,
          observaciones: 'Revisar informe',
        }),
      )
    ).documento;
    for (const id of [b, c]) {
      recibido = (await docs.detalle(id, d.id)).documento;
      assert.equal(recibido.situacion_cuenta, 'DELEGADO_A_MI');
      const lista = await docs.listar(id, docs.filtros.parse({ situacion: 'DELEGADO_A_MI' }));
      assert.ok(lista.documentos.some((v) => v.id === d.id));
      const origenes = await docs.buscarOrigenes(id, 'Seguimiento sintético');
      assert.ok(origenes.documentos.some((v) => v.id === d.id));
    }
    await docs.delegar(
      b,
      d.id,
      docs.delegacion.parse({ revision: d.revision, nombre: 'Persona externa', observaciones: 'Coordinar' }),
    );
    assert.equal(
      (await pool.query('SELECT count(*)::int n FROM delegaciones_documento WHERE documento_id=$1', [d.id]))
        .rows[0].n,
      3,
    );

    const objetos = new Map();
    const store = {
      subir: async () => 'https://example.invalid/subida',
      validarYCopiar: async (origen, destino, tamano) => {
        const bytes = objetos.get(origen);
        await validarPdf(bytes, tamano);
        objetos.set(destino, bytes);
      },
      leer: async (clave) => objetos.get(clave),
      eliminar: async (clave) => {
        objetos.delete(clave);
      },
    };
    const at = atencionDocumental(() => store);
    assert.equal((await docs.detalle(b, d.id)).documento.permisos.relacionar, true);
    await assert.rejects(
      docs.corregir(
        b,
        d.id,
        docs.correccion.parse({
          revision: (await docs.detalle(b, d.id)).documento.revision,
          motivo: 'Intento ajeno',
          asunto: 'Cambio no permitido',
        }),
      ),
      (e) => e.status === 403,
    );
    await assert.rejects(
      docs.anular(b, d.id, {
        revision: (await docs.detalle(b, d.id)).documento.revision,
        motivo: 'Intento ajeno',
      }),
      (e) => e.status === 403,
    );
    await assert.rejects(
      pdfDocumental(() => store).iniciar(b, d.id, {
        nombre: 'principal.pdf',
        tamano: 20,
        mime: 'application/pdf',
        revision: null,
      }),
      (e) => e.status === 403,
    );
    // La exportación conserva una fila por registro, aunque tenga varias delegaciones.
    const hoy = (
      await pool.query(
        "SELECT extract(year from clock_timestamp() AT TIME ZONE 'America/Lima')::int anio,extract(month from clock_timestamp() AT TIME ZONE 'America/Lima')::int mes",
      )
    ).rows[0];
    const excel = await operacion(b, 'Prueba de exportación', async (cl, actor) =>
      leerRegistrosExcel(cl, actor, hoy.anio, hoy.mes),
    );
    assert.equal(excel.filter((v) => v.asunto === 'Seguimiento sintético').length, 1);
    const accion = await at.guardar(b, d.id, null, accionSchema.parse({ descripcion: 'Primera revisión' }));
    let estado = await at.consultar(c, d.id);
    assert.equal(estado.acciones[0].oficina_nombre, null);
    assert.equal(estado.acciones[0].corregir, false);
    await assert.rejects(
      at.guardar(c, d.id, accion.id, accionSchema.parse({ descripcion: 'Cambio ajeno', revision: '1' })),
      (e) => e.status === 403,
    );
    await assert.rejects(at.consultar(f.cuentas.admin.id, d.id), (e) => [403, 404].includes(e.status));
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const bytes = await pdf.save();
    const preparada = await at.iniciar(
      b,
      d.id,
      cargaAccionSchema.parse({ nombre: 'informe.pdf', tamano: bytes.length, mime: 'application/pdf' }),
    );
    const carga = (await pool.query('SELECT * FROM acciones_pdf_cargas WHERE id=$1', [preparada.carga]))
      .rows[0];
    objetos.set(carga.temporal, bytes);
    const invalida = await at.iniciar(
      b,
      d.id,
      cargaAccionSchema.parse({ nombre: 'invalido.pdf', tamano: 10, mime: 'application/pdf' }),
    );
    const intento = (await pool.query('SELECT * FROM acciones_pdf_cargas WHERE id=$1', [invalida.carga]))
      .rows[0];
    objetos.set(intento.temporal, new Uint8Array(10));
    await assert.rejects(
      at.guardar(
        b,
        d.id,
        accion.id,
        accionSchema.parse({ descripcion: 'No debe persistir', revision: '1', carga: invalida.carga }),
      ),
      (e) => e.status === 400,
    );
    assert.equal((await at.consultar(b, d.id)).acciones[0].revision, '1');
    await at.guardar(
      b,
      d.id,
      accion.id,
      accionSchema.parse({ descripcion: 'Revisión corregida', revision: '1', carga: preparada.carga }),
    );
    await assert.rejects(
      at.guardar(b, d.id, accion.id, accionSchema.parse({ descripcion: 'Obsoleta', revision: '1' })),
      (e) => e.status === 409,
    );
    for (const lector of [a, b, c])
      assert.equal(
        (await at.abrir(lector, d.id, accion.id)).contenido,
        Buffer.from(bytes).toString('base64'),
      );
    await pool.query('UPDATE pdf_objetos_pendientes SET limpiar_desde=clock_timestamp() WHERE clave_r2=$1', [
      carga.definitiva,
    ]);
    await limpiarObjetosPdf(() => store, 20, d.id);
    assert.ok(objetos.has(carga.definitiva), 'limpieza conserva PDF vigente');
    assert.equal(
      (await pdfDocumental(() => store).consultar(b, d.id)).limpieza_pendiente,
      0,
      'PDF vigente de acción no figura como eliminación pendiente del original',
    );
    estado = await at.consultar(b, d.id);
    assert.equal(estado.acciones.length, 1);
    assert.equal(estado.eventos.filter((e) => e.tipo === 'CORRECCION').length, 1);
    assert.equal(estado.eventos.find((e) => e.tipo === 'ACCION').descripcion, 'Primera revisión');
    assert.equal(
      estado.eventos.find((e) => e.tipo === 'CORRECCION').anterior.descripcion,
      'Primera revisión',
    );
    await at.guardar(
      b,
      d.id,
      accion.id,
      accionSchema.parse({ descripcion: 'Revisión sin adjunto', revision: '2', retirar_pdf: true }),
    );
    assert.ok(!objetos.has(carga.definitiva), 'adjunto retirado se limpia');
    assert.throws(() =>
      cargaAccionSchema.parse({ nombre: 'grande.pdf', tamano: 15728641, mime: 'application/pdf' }),
    );
    assert.throws(() => accionSchema.parse({ descripcion: ' ' }));
    await at.guardar(b, d.id, null, accionSchema.parse({ descripcion: 'Segunda acción independiente' }));
    assert.equal((await at.consultar(a, d.id)).acciones.length, 2);
    const propio = (
      await docs.registrar(
        c,
        docs.alta.parse({
          tipo_id: f.tipos.usuario,
          clasificacion: 'EMITIDO',
          asunto: 'Respuesta relacionada',
          origen_id: d.id,
        }),
      )
    ).documento;
    assert.ok(propio.grupo.documentos.some((v) => v.id === d.id));
    assert.equal((await docs.detalle(b, d.id)).documento.asunto, 'Seguimiento sintético');
    assert.ok(!(await docs.buscarOrigenes(c, 'Fixture autónomo pendiente')).documentos.length);
    await assert.rejects(
      docs.registrar(
        c,
        docs.alta.parse({
          tipo_id: f.tipos.usuario,
          clasificacion: 'EMITIDO',
          asunto: 'Origen ajeno',
          origen_id: f.documentos.pendiente.id,
        }),
      ),
      (e) => [403, 404].includes(e.status),
    );
    // SQL rechaza una corrección ajena aunque se omita el servicio.
    const cl = await pool.connect();
    try {
      await cl.query('BEGIN');
      await cl.query("SELECT set_config('app.actor_id',$1,true)", [c]);
      await assert.rejects(
        cl.query('UPDATE acciones_documento SET descripcion=$2 WHERE id=$1', [
          accion.id,
          'Intento SQL ajeno',
        ]),
      );
      await cl.query('ROLLBACK');
    } finally {
      cl.release();
    }
    const auditoria = await docs.historial(a, d.id);
    assert.equal(auditoria.historial.filter((h) => h.accion === 'ACCION_CORREGIDA').length, 2);
  } finally {
    await pool.end();
  }
});
