/** Archivo: Comprueba actualización de consultas, regreso a la pestaña y reintentos de lectura sin repetir
 * escrituras.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, Consulta, observarRegreso, solicitar } from './helpers/session.mjs';

test('Consultas ordinarias conservan resultados en actualización y red, nunca ante rechazo o cambio de contexto', async () => {
  const q = new Consulta();
  let completar;
  let fallo;
  let diferir = false;
  const consultar = async () => {
    if (fallo) throw fallo;
    if (diferir)
      return new Promise((resolve) => {
        completar = resolve;
      });
    return ['dato sintético'];
  };
  await q.ejecutar(consultar, 'cuentaA', true);
  diferir = true;
  const pendiente = q.ejecutar(consultar, 'cuentaA', true);
  assert.deepEqual(q.snapshot.datos, ['dato sintético']);
  assert.equal(q.snapshot.pendiente, true);
  completar(['actualizado']);
  await pendiente;
  diferir = false;
  fallo = new ApiError(0, 'Sin red');
  await q.ejecutar(consultar, 'cuentaA', true);
  assert.deepEqual(q.snapshot.datos, ['actualizado']);
  assert.equal(q.snapshot.error, 'Sin red');
  fallo = new ApiError(403, 'Sin permiso');
  await q.ejecutar(consultar, 'cuentaA', true);
  assert.equal(q.snapshot.datos, null);
  fallo = undefined;
  await q.ejecutar(consultar, 'cuentaA', true);
  diferir = true;
  const otra = q.ejecutar(consultar, 'cuentaB', true);
  assert.equal(q.snapshot.datos, null);
  q.limpiar();
  completar(['respuesta antigua']);
  await otra;
  assert.equal(q.snapshot.datos, null);
});

test('Contenido restringido, filtros distintos y desmontaje nunca reutilizan la respuesta anterior', async () => {
  const q = new Consulta();
  const inicial = async () => ['sintético'];
  await q.ejecutar(inicial, 'A', true);
  let completar;
  const distinto = () =>
    new Promise((resolve) => {
      completar = resolve;
    });
  const cambio = q.ejecutar(distinto, 'A', true);
  assert.equal(q.snapshot.datos, null);
  q.cancelar();
  completar(['descartar']);
  await cambio;
  assert.equal(q.snapshot.datos, null);
  await q.ejecutar(inicial, 'A', true);
  const restringida = q.ejecutar(inicial, 'A', false);
  assert.equal(q.snapshot.datos, null);
  await restringida;
  q.limpiar();
  assert.equal(q.snapshot.datos, null);
});

test('Foco, pageshow y visibilidad de un regreso producen una actualización; ocultar notifica al suscriptor', () => {
  const ventana = new globalThis.EventTarget();
  const pagina = new globalThis.EventTarget();
  pagina.visibilityState = 'visible';
  let reloj = 0;
  let vueltas = 0;
  let ocultaciones = 0;
  const retirar = observarRegreso(
    () => vueltas++,
    () => ocultaciones++,
    ventana,
    pagina,
    () => reloj,
  );
  reloj = 31000;
  ventana.dispatchEvent(new globalThis.Event('focus'));
  ventana.dispatchEvent(new globalThis.Event('pageshow'));
  pagina.dispatchEvent(new globalThis.Event('visibilitychange'));
  assert.equal(vueltas, 1);
  pagina.visibilityState = 'hidden';
  pagina.dispatchEvent(new globalThis.Event('visibilitychange'));
  assert.equal(ocultaciones, 1);
  pagina.visibilityState = 'visible';
  pagina.dispatchEvent(new globalThis.Event('visibilitychange'));
  assert.equal(vueltas, 2);
  retirar();
  reloj += 5000;
  ventana.dispatchEvent(new globalThis.Event('focus'));
  assert.equal(vueltas, 2);
});

test('Transporte limita GET a dos intentos y nunca repite login, escrituras ni abortos explícitos', async () => {
  const original = globalThis.fetch;
  try {
    for (const [ruta, opciones, esperados] of [
      ['/api/dashboard', {}, 2],
      ['/api/auth/login', { method: 'POST' }, 1],
      ['/api/documentos', { method: 'PATCH', body: '{}' }, 1],
      ['/api/documentos', { signal: new globalThis.AbortController().signal }, 1],
    ]) {
      let intentos = 0;
      globalThis.fetch = async () => {
        intentos++;
        throw new Error('Sin red sintética');
      };
      await assert.rejects(solicitar(ruta, opciones, ruta));
      assert.equal(intentos, esperados);
    }
    for (const status of [401, 403, 429, 500, 502, 503, 504]) {
      let intentos = 0;
      globalThis.fetch = async () => {
        intentos++;
        return new Response('{}', { status });
      };
      const respuesta = await solicitar('/api/dashboard', {}, '/api/dashboard');
      assert.equal(respuesta.respuesta.status, status);
      assert.equal(intentos, [502, 503, 504].includes(status) ? 2 : 1);
    }
    let intentos = 0;
    globalThis.fetch = async () => {
      intentos++;
      return new Response('{}', { status: intentos === 1 ? 503 : 200 });
    };
    assert.equal((await solicitar('/api/dashboard', {}, '/api/dashboard')).respuesta.status, 200);
    assert.equal(intentos, 2);
  } finally {
    globalThis.fetch = original;
  }
});
