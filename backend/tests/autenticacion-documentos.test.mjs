import './helpers/exigir-aislamiento.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {performance} from 'node:perf_hooks';
import pg from 'pg';
import {leerFixtures} from './helpers/entorno-prueba.mjs';
import {app} from '../dist/app.js';
import {pool} from '../dist/config/database.js';
import {generarToken} from '../dist/shared/security/jwt.js';

test('Documentos y PDF: una autenticación SQL por petición con JWT verificable', async () => {
  const {cuentas, documentos} = leerFixtures();
  const original = pg.Client.prototype.query;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/documentos';
  let consultas;
  pg.Client.prototype.query = function (...args) {
    const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text ?? '';
    const registro = {auth: sql.includes('WHERE u.id = $1::bigint') && sql.includes('u.version_autenticacion'), ms: 0};
    consultas?.push(registro);
    const inicio = performance.now();
    const medir = () => { registro.ms = performance.now() - inicio; };
    if (typeof args.at(-1) === 'function') {
      const callback = args.pop();
      args.push((...valores) => { medir(); callback(...valores); });
      return original.apply(this, args);
    }
    return original.apply(this, args).finally(medir);
  };
  const token = (cuenta, version = cuenta.version_autenticacion) => generarToken(cuenta.id, version);
  const diferencias = [];
  async function pedir(ruta, jwt, status, esperadas = 1, cache = 'no-store, private') {
    consultas = [];
    const inicio = performance.now();
    const respuesta = await fetch(base + ruta, {headers: jwt ? {Authorization: 'Bearer ' + jwt} : {}});
    const datos = await respuesta.json();
    const apiMs = performance.now() - inicio;
    assert.equal(respuesta.status, status, ruta);
    assert.equal(respuesta.headers.get('cache-control'), cache, ruta);
    const auth = consultas.filter(q => q.auth);
    if (auth.length !== esperadas) diferencias.push({ruta, status, esperadas, observadas: auth.length});
    return {datos, apiMs, authN: auth.length, sqlN: consultas.length,
      authMs: auth.reduce((s, q) => s + q.ms, 0),
      sqlMs: consultas.reduce((s, q) => s + q.ms, 0)};
  }
  try {
    const direccion = token(cuentas.director);
    if (process.env.MEDIR_AUTH_DOCUMENTOS === '1') {
      for (let i = 0; i < 15; i++) await pedir('', direccion, 200);
      const muestras = [];
      for (let i = 0; i < 120; i++) {
        const {datos, ...medicion} = await pedir('', direccion, 200);
        assert.ok(datos.total > 0);
        muestras.push(medicion);
      }
      const resumen = Object.fromEntries(Object.keys(muestras[0]).map(campo => {
        const v = muestras.map(m => m[campo]).sort((a, b) => a - b);
        return [campo, {mediana: (v[59] + v[60]) / 2, p95: v[113]}];
      }));
      console.log('MEDICION_AUTH_DOCUMENTOS', JSON.stringify(resumen));
    }

    for (const [rol, cuenta] of Object.entries(cuentas)) {
      const jwt = token(cuenta);
      await pedir('', jwt, 200);
      await pedir('?situacion=ANULADO', jwt, rol === 'superadmin' ? 200 : 403);
      const id = documentos.personal.id;
      const lectura = ['admin', 'sinOficina'].includes(rol) ? 404 : 200;
      await pedir('/' + id, jwt, lectura);
      const pdf = await pedir('/' + id + '/pdf', jwt, lectura);
      if (lectura === 200) {
        assert.equal(pdf.datos.archivo.nombre, 'fixture.pdf');
        assert.equal(pdf.datos.modificar, rol === 'usuario');
        assert.equal(pdf.datos.eliminar, rol === 'usuario');
      }
      await pedir('/sin/ruta', jwt, 404);
      for (const ruta of ['', '/' + id + '/pdf', '/sin/ruta']) {
        await pedir(ruta, token(cuenta, cuenta.version_autenticacion + 1), 401, 1, null);
      }
    }
    const recibido = '/' + documentos.delegado.id;
    const receptor = token(cuentas.sinOficina);
    const { datos } = await pedir(recibido, receptor, 200);
    assert.equal(datos.documento.delegado_por_nombre, 'Fixture director');
    assert.ok(Object.values(datos.documento.permisos).every(v => !v));
    assert.deepEqual((await pedir(recibido + '/historial', receptor, 200)).datos, { historial: [] });
    await pedir(recibido, token(cuentas.usuario), 404);
    const revision = datos.documento.revision;
    const motivo = 'Validación HTTP sintética';
    for (const [method, ruta, body] of [
      ['PUT', '', { revision, asunto: 'Cambio de prueba', motivo }],
      ['POST', '/delegar', { revision, nombre: 'Prueba' }],
      ['POST', '/ubicacion', { revision, unidad_id: '1' }],
      ['POST', '/anular', { revision, motivo }],
      ['POST', '/pdf/cargas', { revision: null, nombre: 'prueba.pdf', tamano: 100, mime: 'application/pdf' }],
      ['POST', '/pdf/confirmar', { carga: '00000000-0000-4000-8000-000000000000' }],
      ['POST', '/pdf/eliminar', { revision: '00000000-0000-4000-8000-000000000000', confirmar: true }],
    ]) {
      const respuesta = await fetch(base + recibido + ruta, {
        method,
        headers: { Authorization: 'Bearer ' + receptor, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await respuesta.text();
      assert.equal(respuesta.status, 403, method + ' ' + ruta);
    }

    for (const ruta of ['', '/1/pdf', '/sin/ruta']) {
      await pedir(ruta, null, 401, 0, null);
      await pedir(ruta, 'jwt-invalido', 401, 0, null);
    }
    await pedir('/no-es-id/pdf', direccion, 400);
    assert.deepEqual(diferencias.slice(0, 8), [], 'Consultas SQL de autenticación por petición');
  } finally {
    pg.Client.prototype.query = original;
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
});
