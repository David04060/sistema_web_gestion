/** Archivo: Comprueba inicio, recuperación, vencimiento y cierre de sesión con reloj controlado.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AuthSession,
  ApiError,
  apiRequest,
  obtenerVencimiento,
  usuario,
  base,
  jwt,
  preparar,
} from './helpers/session.mjs';

test('Foco repetido limita /me durante 30 s, comprueba exp y no desmonta la sesión válida', async () => {
  let completar;
  let diferir = false;
  const f = preparar({
    token: jwt(base / 1000 + 900),
    perfil: () =>
      diferir
        ? new Promise((resolve) => {
            completar = resolve;
          })
        : { usuario },
  });
  await f.session.recuperar();
  const sesion = f.session.getSnapshot().sesion;
  for (let i = 0; i < 5; i++) await f.session.revalidarAlVolver();
  assert.equal(f.consultas, 1);
  f.avanzar(30001);
  diferir = true;
  const pendiente = f.session.revalidarAlVolver();
  assert.equal(f.session.getSnapshot().estado, 'autenticado');
  assert.equal(f.session.getSnapshot().revalidando, true);
  assert.equal(f.session.getSnapshot().sesion, sesion);
  assert.equal(f.session.revalidarAlVolver(), pendiente);
  completar({ usuario });
  await pendiente;
  assert.equal(f.consultas, 2);
  assert.equal(f.session.getSnapshot().sesion, sesion);
  assert.equal(f.session.getSnapshot().revalidando, false);
  f.avanzar(900000);
  await f.session.revalidarAlVolver();
  assert.equal(f.session.getSnapshot().estado, 'anonimo');
  assert.equal(f.consultas, 2);
});

test('Revalidación fallida bloquea acceso; rechazo revoca, red conserva solo el JWT para reintentar', async () => {
  for (const status of [0, 401, 403, 503]) {
    let falla = false;
    const f = preparar({
      token: jwt(base / 1000 + 900),
      perfil: async () => {
        if (falla) throw new ApiError(status, 'No disponible');
        return { usuario };
      },
    });
    await f.session.recuperar();
    falla = true;
    f.avanzar(30001);
    await f.session.revalidarAlVolver();
    assert.equal(f.session.getSnapshot().sesion, null);
    assert.equal(f.session.getSnapshot().estado, [401, 403].includes(status) ? 'anonimo' : 'error');
    assert.equal(!!f.token, ![401, 403].includes(status));
  }
});

test('Cambio de perfil invalida el contexto sin renovar el vencimiento', async () => {
  let perfil = usuario;
  const f = preparar({ token: jwt(base / 1000 + 900), perfil: async () => ({ usuario: perfil }) });
  await f.session.recuperar();
  const anterior = f.session.getSnapshot();
  perfil = { ...usuario, rol: 'Otro rol', oficina: 'Otra oficina' };
  await f.session.recuperar();
  assert.equal(f.session.getSnapshot().revisionAcceso, anterior.revisionAcceso + 1);
  assert.equal(f.session.getSnapshot().sesion.venceEn, anterior.sesion.venceEn);
});

test('Expiración o logout durante revalidación en segundo plano no resucitan el acceso', async () => {
  for (const expirar of [false, true]) {
    let diferir = false;
    let completar;
    const f = preparar({
      token: jwt(base / 1000 + 60),
      perfil: () =>
        diferir
          ? new Promise((resolve) => {
              completar = resolve;
            })
          : { usuario },
    });
    await f.session.recuperar();
    f.avanzar(30001);
    diferir = true;
    const pendiente = f.session.revalidarAlVolver();
    if (expirar) {
      f.avanzar(30000);
      f.ejecutar();
    } else f.session.cerrarSesion();
    completar({ usuario });
    await pendiente;
    assert.equal(f.session.getSnapshot().sesion, null);
    assert.equal(f.token, null);
  }
});
test('Sin token no consulta /me ni autentica', async () => {
  const f = preparar();
  await f.session.recuperar();
  assert.equal(f.session.getSnapshot().estado, 'anonimo');
  assert.equal(f.consultas, 0);
});
test('Restauración bloquea vistas hasta que /me responde y conserva exp original', async () => {
  let completar;
  const token = jwt(base / 1000 + 100);
  const f = preparar({
    token,

    perfil: () =>
      new Promise((resolve) => {
        completar = resolve;
      }),
  });
  const pendiente = f.session.recuperar();
  assert.equal(f.session.getSnapshot().estado, 'verificando');
  assert.equal(f.session.getSnapshot().sesion, null);
  completar({ usuario });
  await pendiente;
  assert.equal(f.session.getSnapshot().sesion.venceEn, base + 100000);
  assert.equal(f.token, token);
});
test('Login de una hora conserva el vencimiento original al recargar y cierra al cumplirlo', async () => {
  const f = preparar();
  await f.session.recuperar();
  await f.session.ingresar({ identificador: 'prueba', contrasena: 'prueba' });
  assert.equal(f.session.getSnapshot().estado, 'autenticado');
  assert.ok(f.token);
  const vencimiento = f.session.getSnapshot().sesion.venceEn;
  assert.equal(vencimiento, base + 3600000);
  f.avanzar(1800000);
  await f.session.recuperar();
  assert.equal(f.session.getSnapshot().sesion.venceEn, vencimiento);
  assert.equal(f.session.getSnapshot().estado, 'autenticado');
  f.avanzar(1800000);
  f.ejecutar();
  assert.equal(f.session.getSnapshot().estado, 'anonimo');
  assert.equal(f.token, null);
});
test('Credenciales incorrectas no almacenan token', async () => {
  const f = preparar({
    /** Rechaza el login con 401 para comprobar que no se persista un JWT. */
    login: async () => {
      throw new ApiError(401, 'Credenciales incorrectas');
    },
  });
  await f.session.recuperar();
  await f.session.ingresar({ identificador: 'prueba', contrasena: 'incorrecta' });
  assert.equal(f.session.getSnapshot().estado, 'anonimo');
  assert.equal(f.token, null);
  assert.match(f.session.getSnapshot().error, /incorrectas/);
});
test('JWT malformado o vencido se elimina antes de consultar /me', async () => {
  for (const token of ['invalido', jwt(base / 1000 - 1)]) {
    const f = preparar({ token });
    await f.session.recuperar();
    assert.equal(f.session.getSnapshot().estado, 'anonimo');
    assert.equal(f.token, null);
    assert.equal(f.consultas, 0);
  }
  assert.throws(() => obtenerVencimiento('e30.e30.firma'));
});
test('/me rechaza JWT con firma inválida: 401/403 eliminan el token y bloquean acceso', async () => {
  for (const status of [401, 403]) {
    const f = preparar({
      token: jwt(base / 1000 + 900),

      perfil: async () => {
        throw new ApiError(status, 'Rechazado');
      },
    });
    await f.session.recuperar();
    assert.equal(f.session.getSnapshot().estado, 'anonimo');
    assert.equal(f.token, null);
    assert.equal(f.consultas, 1);
  }
});
test('Fallo de conexión conserva token vigente sin contenido privado y permite reintentar', async () => {
  let falla = true;
  const f = preparar({
    token: jwt(base / 1000 + 900),

    perfil: async () => {
      if (falla) throw new ApiError(0, 'Sin conexión');
      return { usuario };
    },
  });
  await f.session.recuperar();
  assert.equal(f.session.getSnapshot().estado, 'error');
  assert.equal(f.session.getSnapshot().sesion, null);
  assert.ok(f.token);
  falla = false;
  await f.session.recuperar();
  assert.equal(f.session.getSnapshot().estado, 'autenticado');
});
test('El vencimiento elimina token aun durante una caída del backend', async () => {
  const f = preparar({
    token: jwt(base / 1000 + 10),

    perfil: async () => {
      throw new ApiError(500, 'No disponible');
    },
  });
  await f.session.recuperar();
  f.avanzar(10001);
  f.ejecutar();
  assert.equal(f.token, null);
  assert.equal(f.session.getSnapshot().estado, 'anonimo');
});
test('Reloj al navegar/foco y temporizador cierran sesión sin ampliar vencimiento', async () => {
  for (const temporizador of [false, true]) {
    const f = preparar({ token: jwt(base / 1000 + 10) });
    await f.session.recuperar();
    f.avanzar(10001);
    if (temporizador) f.ejecutar();
    else f.session.comprobarVencimiento();
    assert.equal(f.token, null);
    assert.equal(f.session.getSnapshot().sesion, null);
  }
});
test('Logout limpia sesión y descarta respuestas pendientes de /me', async () => {
  let completar;
  const f = preparar({
    token: jwt(base / 1000 + 900),

    perfil: () =>
      new Promise((resolve) => {
        completar = resolve;
      }),
  });
  const pendiente = f.session.recuperar();
  f.session.cerrarSesion();
  completar({ usuario });
  await pendiente;
  assert.equal(f.token, null);
  assert.equal(f.session.getSnapshot().estado, 'anonimo');
});
test('La recuperación pendiente no retrasa exp ni puede resucitar un token ya vencido', async () => {
  let completar;
  const f = preparar({
    token: jwt(base / 1000 + 10),

    perfil: () =>
      new Promise((resolve) => {
        completar = resolve;
      }),
  });
  const pendiente = f.session.recuperar();
  f.avanzar(10001);
  f.ejecutar();
  assert.equal(f.token, null);
  completar({ usuario });
  await pendiente;
  assert.equal(f.session.getSnapshot().estado, 'anonimo');
});
test('Almacenamiento bloqueado o perfil incompatible no producen autenticación parcial', async () => {
  for (const opciones of [
    { guardarFalla: true },
    {
      /** Devuelve una identidad distinta del login para impedir una autenticación parcial. */
      perfil: async () => ({ usuario: { ...usuario, id: '2' } }),
    },
  ]) {
    const f = preparar(opciones);
    await f.session.recuperar();
    await f.session.ingresar({ identificador: 'prueba', contrasena: 'prueba' });
    assert.equal(f.session.getSnapshot().sesion, null);
    assert.equal(f.token, null);
    assert.ok(f.session.getSnapshot().error);
  }
});
test('401 autenticado invalida sesión; 403 de otra operación conserva identidad', async () => {
  const original = globalThis.fetch;
  const f = preparar({ token: jwt(base / 1000 + 900) });
  try {
    f.session.iniciar();
    await new Promise((resolve) => setImmediate(resolve));
    for (const status of [403, 401]) {
      globalThis.fetch = async () => new Response('{}', { status });
      await assert.rejects(
        apiRequest(
          '/api/privada',
          {
            /** Acepta el contrato ficticio; este caso comprueba el estado HTTP, no el esquema de contenido. */
            safeParse: () => ({ success: true }),
          },
          {},
          f.token,
        ),
      );
      assert.equal(f.session.getSnapshot().estado, status === 403 ? 'autenticado' : 'anonimo');
    }
  } finally {
    f.session.detener();
    globalThis.fetch = original;
  }
});
test('Temporizadores nativos no reciben el adaptador como contexto (regresión Illegal invocation)', async () => {
  const programar = globalThis.setTimeout;
  const cancelar = globalThis.clearTimeout;
  globalThis.setTimeout =
    /**
     * Simula el temporizador nativo y rechaza un contexto incorrecto para detectar la regresión Illegal
     * invocation.
     */
    function () {
      if (this && this !== globalThis) throw new TypeError('Illegal invocation');
      return 1;
    };
  globalThis.clearTimeout =
    /**
     * Simula la cancelación nativa y rechaza un contexto incorrecto para detectar la regresión Illegal
     * invocation.
     */
    function () {
      if (this && this !== globalThis) throw new TypeError('Illegal invocation');
    };
  const session = new AuthSession({
    ahora: () => base,
    storage: {
      leer: () => jwt(base / 1000 + 900),
      /**
       * Adaptador deliberadamente vacío: esta regresión verifica el contexto de temporizadores, no la
       * persistencia.
       */
      guardar() {},
      /** Adaptador deliberadamente vacío que evita tocar el almacenamiento real al cerrar el fixture. */
      eliminar() {},
    },
    api: {
      /** Falla si se intenta autenticar: este escenario debe usar únicamente recuperación mediante /me. */
      iniciarSesion: async () => {
        throw new Error('No usado');
      },

      obtenerMiUsuario: async () => ({ usuario }),
    },
  });
  try {
    await session.recuperar();
    assert.equal(session.getSnapshot().estado, 'autenticado');
    session.cerrarSesion();
    assert.equal(session.getSnapshot().estado, 'anonimo');
  } finally {
    globalThis.setTimeout = programar;
    globalThis.clearTimeout = cancelar;
  }
});
test('Revalidaciones simultáneas comparten /me pendiente y vuelven a consultar después', async () => {
  let completar;
  const f = preparar({
    token: jwt(base / 1000 + 900),

    perfil: () =>
      new Promise((resolve) => {
        completar = resolve;
      }),
  });
  const primera = f.session.recuperar();
  const segunda = f.session.recuperar();
  assert.equal(primera, segunda);
  assert.equal(f.consultas, 1);
  completar({ usuario });
  await primera;
  const tercera = f.session.recuperar();
  assert.equal(f.consultas, 2);
  completar({ usuario });
  await tercera;
});
test('Logout separa una nueva recuperación de la anterior y evita resucitar sesiones', async () => {
  let completar;
  const f = preparar({
    token: jwt(base / 1000 + 900),

    perfil: () =>
      new Promise((resolve) => {
        completar = resolve;
      }),
  });
  const anterior = f.session.recuperar();
  f.session.cerrarSesion();
  await f.session.recuperar();
  assert.equal(f.session.getSnapshot().estado, 'anonimo');
  completar({ usuario });
  await anterior;
  assert.equal(f.session.getSnapshot().estado, 'anonimo');
  assert.equal(f.token, null);
});
