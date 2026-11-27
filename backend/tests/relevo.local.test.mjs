/** Archivo: Comprueba cambio de responsable, periodos históricos y tipos heredados de oficina.
 */
import './helpers/exigir-aislamiento.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pool } from '../dist/config/database.js';
import { verificarEntornoPrueba, leerFixtures } from './helpers/entorno-prueba.mjs';
import * as docs from '../dist/modules/documentos/documentos.operaciones.js';
import * as admin from '../dist/modules/usuarios/administracion.operaciones.js';
import { opcionesRelevo, relevarOficina } from '../dist/modules/usuarios/relevo.operaciones.js';
import { pdfDocumental } from '../dist/modules/documentos-pdf/pdf.documental.js';
import { generarToken } from '../dist/shared/security/jwt.js';
import { app } from '../dist/app.js';
const password = 'Sintetica-Local-2026';
test('Relevo A-B-C y cinco roles: exclusividad, tipos, PDF, historia y solo lectura', async () => {
  await verificarEntornoPrueba(pool);
  const f = leerFixtures(),
    actor = f.cuentas.superadmin;
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const pedir = async (u, path, body) => {
    const r = await fetch('http://127.0.0.1:' + server.address().port + '/api' + path, {
      headers: {
        Authorization: 'Bearer ' + generarToken(u.id, u.version_autenticacion),
        'Content-Type': 'application/json',
      },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, body: await r.json() };
  };
  const crear = async (rol, key) => ({
    id: (
      await admin.crearUsuario(
        actor.id,
        admin.usuarioAlta.parse({
          nombre: 'Fixture',
          apellido: key,
          nombre_usuario: 'relevo_' + key,
          rol_id: rol,
          oficina_id: null,
          contrasena: password,
        }),
      )
    ).id,
  });
  const ejecutar = async (oficina, saliente, reemplazo) => {
    const o = await opcionesRelevo(actor.id, oficina);
    return relevarOficina(actor.id, oficina, {
      saliente_id: saliente.id,
      reemplazo_id: reemplazo.id,
      version_saliente: o.responsable.version_autenticacion,
      version_reemplazo: o.candidatos.find((u) => u.id === reemplazo.id).version_autenticacion,
      motivo: 'Relevo sintético',
    });
  };
  try {
    for (const key of ['usuario', 'director', 'secretaria']) {
      const a = f.cuentas[key],
        oficina = a.oficina_id;
      const tipo = key === 'usuario' ? f.tipos.usuario : f.tipos.director;
      const d = (
        await docs.registrar(
          a.id,
          docs.alta.parse({
            tipo_id: tipo,
            clasificacion: 'RECIBIDO',
            asunto: 'Periodo original ' + key,
            ...(key === 'secretaria' ? { conservar_en_mesa: true } : {}),
          }),
        )
      ).documento;
      const unidad = await admin.crearUnidad(a.id, {
        clase: 'Estante',
        nombre: 'Lugar anterior ' + key,
        padre_id: null,
      });
      await docs.ubicar(a.id, d.id, { revision: d.revision, unidad_id: unidad.id });
      const before = (await pool.query('SELECT * FROM documentos WHERE id=$1', [d.id])).rows[0];
      const b = await crear(a.rol_id, key + '_b'),
        c = await crear(a.rol_id, key + '_c');
      if (a.rol_id !== 5) {
        await assert.rejects(docs.detalle(b.id, d.id), (e) => e.status === 404);
        await assert.rejects(docs.opciones(b.id), (e) => e.status === 403);
      }
      const storage = {
        subir: async () => 'https://storage.invalid/upload',
        validarYCopiar: async () => {},
        abrir: async () => 'https://storage.invalid/pdf',
        eliminar: async () => {},
      };
      const servicio = pdfDocumental(() => storage);
      const carga = await servicio.iniciar(a.id, d.id, {
        revision: null,
        nombre: 'fixture.pdf',
        tamano: 127,
        mime: 'application/pdf',
      });
      await servicio.confirmar(a.id, d.id, carga.carga);
      for (const prohibido of [a, f.cuentas.sinOficina])
        await assert.rejects(opcionesRelevo(prohibido.id, oficina), (e) => e.status === 403);
      if (key === 'usuario')
        await admin.crearTipo(b.id, { nombre: 'Preparado antes de asignar', prefijo: 'PREP' });
      await ejecutar(oficina, a, b);
      assert.equal(
        (await pool.query('SELECT activo FROM usuarios WHERE id=$1', [a.id])).rows[0].activo,
        false,
      );
      assert.equal((await pedir(a, '/auth/me')).status, 401);
      const heredado = (await docs.detalle(b.id, d.id)).documento;
      if (key === 'usuario') {
        assert.equal(heredado.situacion_cuenta, 'EN_MI_OFICINA');
        assert.ok((await docs.historial(b.id, d.id)).historial.length);
        await assert.rejects(docs.detalle(c.id, d.id), (e) => e.status === 404);
        await assert.rejects(servicio.abrir(c.id, d.id, false), (e) => e.status === 404);
      }
      assert.equal(heredado.historico_solo_lectura, true);
      assert.equal(heredado.registrado_por, a.id);
      assert.equal(heredado.ubicacion.unidad_id, unidad.id);
      for (const k of ['corregir', 'delegar', 'anular', 'ubicar', 'pdf'])
        assert.equal(heredado.permisos[k], false, key + ' ' + k);
      assert.equal((await admin.unidades(b.id)).unidades.length, 0);
      const opts = await docs.opciones(b.id);
      assert.ok(opts.tipos.some((t) => t.prefijo === 'BASEQA'));
      const nuevo = (
        await docs.registrar(
          b.id,
          docs.alta.parse({
            tipo_id: opts.tipos[0].id,
            clasificacion: 'RECIBIDO',
            asunto: 'Nuevo autor',
            origen_id: d.id,
          }),
        )
      ).documento;
      assert.equal(nuevo.registrado_por, b.id);
      assert.equal(nuevo.historico_solo_lectura, false);
      assert.equal(nuevo.permisos.corregir, true);
      assert.equal(nuevo.permisos.pdf, true);
      assert.ok((await servicio.consultar(b.id, d.id)).archivo);
      assert.ok((await servicio.abrir(b.id, d.id, false)).url);
      const pdf = (await servicio.consultar(b.id, d.id)).archivo;
      await assert.rejects(servicio.eliminar(b.id, d.id, pdf.revision), (e) => e.status === 403);
      await assert.rejects(servicio.confirmar(b.id, d.id, carga.carga), (e) => e.status === 403);
      const tokenB = (await pool.query('SELECT version_autenticacion FROM usuarios WHERE id=$1', [b.id]))
        .rows[0].version_autenticacion;
      const bActual = { ...b, version_autenticacion: tokenB };
      for (const [accion, body] of [
        ['anular', { revision: heredado.revision, motivo: 'No permitido' }],
        ['delegar', { revision: heredado.revision, nombre: 'Persona' }],
        ['ubicacion', { revision: heredado.revision, unidad_id: unidad.id }],
        ['pdf/cargas', { revision: null, nombre: 'sintetico.pdf', tamano: 10, mime: 'application/pdf' }],
      ])
        assert.equal((await pedir(bActual, '/documentos/' + d.id + '/' + accion, body)).status, 403);
      await assert.rejects(
        pool.query('UPDATE documentos SET asunto=$2 WHERE id=$1', [d.id, 'Intento SQL']),
        (e) => e.code === '42501',
      );
      const restringido = await pool.connect();
      try {
        await restringido.query('BEGIN');
        await restringido.query('CREATE ROLE prueba_escritura_relevo NOLOGIN');
        await restringido.query('GRANT USAGE ON SCHEMA public TO prueba_escritura_relevo');
        await restringido.query('GRANT SELECT ON documentos,usuarios TO prueba_escritura_relevo');
        await restringido.query('GRANT UPDATE ON documentos TO prueba_escritura_relevo');
        await restringido.query('SET LOCAL ROLE prueba_escritura_relevo');
        await assert.rejects(
          restringido.query('UPDATE documentos SET asunto=$2 WHERE id=$1', [d.id, 'Rechazo restringido']),
          (e) => e.code === '42501' && /periodo anterior|histórico/.test(e.message),
        );
      } finally {
        await restringido.query('ROLLBACK');
        restringido.release();
      }

      await ejecutar(oficina, b, c);
      if (key === 'usuario') assert.ok((await docs.opciones(c.id)).tipos.some((t) => t.prefijo === 'PREP'));
      assert.equal((await docs.detalle(c.id, d.id)).documento.historico_solo_lectura, true);
      assert.equal((await docs.detalle(c.id, nuevo.id)).documento.historico_solo_lectura, true);
      assert.deepEqual((await pool.query('SELECT * FROM documentos WHERE id=$1', [d.id])).rows[0], before);
      assert.equal(
        (await pool.query('SELECT count(*)::int n FROM documentos_pdf WHERE documento_id=$1', [d.id])).rows[0]
          .n,
        1,
      );
      await assert.rejects(
        admin.cambiarActividad(actor.id, a.id, { activo: true, motivo: 'Conflicto' }),
        (e) => e.code === '23505' || e.status === 409,
      );
      await admin.cambiarActividad(actor.id, c.id, { activo: false, motivo: 'Fin periodo sintético' });
      await admin.cambiarActividad(actor.id, a.id, { activo: true, motivo: 'Regreso sintético' });
      assert.equal((await docs.detalle(a.id, d.id)).documento.permisos.pdf, false);
      const retorno = (
        await docs.registrar(
          a.id,
          docs.alta.parse({ tipo_id: tipo, clasificacion: 'RECIBIDO', asunto: 'Periodo de retorno' }),
        )
      ).documento;
      assert.equal(retorno.permisos.pdf, true);
    }
    await assert.rejects(
      docs.detalle(f.cuentas.sinOficina.id, f.documentos.personal.id),
      (e) => e.status === 404,
    );
    const s = pdfDocumental(() => ({ abrir: async () => 'https://storage.invalid/pdf' }));
    assert.ok((await s.consultar(f.cuentas.superadmin.id, f.documentos.personal.id)).archivo);
  } finally {
    await new Promise((r) => server.close(r));
    await pool.end();
  }
});
