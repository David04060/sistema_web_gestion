import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { build } from 'vite';
// El código productivo siempre usa la API real. Solo estas pruebas inyectan reloj,
// almacenamiento y transporte para reproducir fallos y vencimiento sin esperar 15 minutos.
const result = await build({
    configFile: false, logLevel: 'silent',
    plugins: [{
            name: 'session-test-entry',
            /** Reconoce el identificador virtual que permite compilar contratos reales en memoria para estas pruebas. */
            resolveId(id) {
                if (id === 'virtual:session-test')
                    return '\0virtual:session-test';
            },
            /** Construye las exportaciones virtuales desde los módulos reales; evita mantener copias de sus implementaciones en las pruebas. */
            load(id) {
                if (id !== '\0virtual:session-test')
                    return;
                return [
                    ['AuthSession', 'src/features/auth/services/AuthSession.ts'],
                    ['ApiError, apiRequest', 'src/api/client.ts'],
                    ['obtenerVencimiento', 'src/features/auth/services/sessionStorage.ts'],
                ].map(/** Construye la reexportación del módulo real con una ruta portátil para compilar la prueba en memoria. */ ([exports, file]) => `export {${exports}} from ${JSON.stringify(resolve(file).replaceAll('\\', '/'))};`).join('\n');
            },
        }],
    build: { write: false, minify: false, rollupOptions: { input: 'virtual:session-test', preserveEntrySignatures: 'strict', output: { format: 'es', codeSplitting: false } } },
});
const chunk = (Array.isArray(result) ? result : [result]).flatMap(/** Transforma cada entrada de (Array.isArray(result) ? result : [result]) para construir los datos que comprueba este escenario. */ /** Reúne los archivos emitidos por Vite tanto si devolvió un resultado único como si generó varios. */ item => item.output).find(/** Selecciona las entradas de (Array.isArray(result) ? result : [result]).flatMap(item => item.output) que cumplen el criterio requerido por la comprobación. */ /** Identifica el chunk JavaScript de entrada entre los archivos generados por Vite para inspeccionar el código real. */ item => item.type === 'chunk' && item.isEntry);
const { AuthSession, ApiError, apiRequest, obtenerVencimiento } = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
const usuario = { id: '1', nombre: 'Prueba', apellido: 'Local', nombre_usuario: 'prueba', email: null, rol: 'Prueba', oficina: null };
const base = 1800000000000;
/** Construye un JWT ficticio con exp para probar el reloj del cliente; no contiene una firma válida para el backend. */
const jwt = exp => `e30.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.firma-de-prueba`;
/** Crea una sesión con almacenamiento, reloj, temporizadores y API controlados; devuelve adaptadores para comprobar carreras y vencimiento. */
function preparar({ token = null, perfil, login, guardarFalla = false } = {}) {
    let almacenado = token;
    let ahora = base;
    let consultas = 0;
    const temporizadores = new Map();
    let siguiente = 0;
    const tokenLogin = jwt(base / 1000 + 900);
    const session = new AuthSession({
        storage: {
            /** Devuelve el JWT controlado por el caso sin acceder al almacenamiento real del navegador. */
            leer: () => almacenado,
            /** Simula la persistencia del JWT en memoria, incluyendo el fallo de almacenamiento cuando lo solicita el caso. */
            guardar: value => {
                if (guardarFalla)
                    throw new Error('Almacenamiento no disponible');
                almacenado = value;
            },
            /** Descarta el JWT de la memoria controlada por la prueba; no accede a datos de sesión reales. */
            eliminar: () => {
                almacenado = null;
            },
        },
        /** Devuelve el instante controlado por la prueba sin depender del reloj real. */
        ahora: () => ahora,
        /** Registra el temporizador simulado para permitir comprobar el vencimiento de forma determinista. */
        programar: (fn, ms) => {
            const id = ++siguiente;
            temporizadores.set(id, { fn, ms });
            return id;
        },
        /** Retira el temporizador simulado de la colección del caso. */
        cancelar: id => temporizadores.delete(id),
        api: {
            iniciarSesion: login ?? ( /** Devuelve el login ficticio del caso con el mismo contrato y vencimiento de la API. */async () => ({ token: tokenLogin, usuario, tipo: 'Bearer', expiresIn: 900 })),
            /** Simula /me con el perfil o comportamiento configurado por el caso y permite contar sus solicitudes. */
            obtenerMiUsuario: async (token) => {
                consultas++;
                return perfil ? perfil(token) : { usuario };
            },
        },
    });
    return { session, 
/** Expone el JWT de la memoria de prueba para comprobar persistencia o limpieza. */
        get token() {
            return almacenado;
        }, 
/** Expone cuántas revalidaciones ejecutó la sesión durante este caso. */
        get consultas() {
            return consultas;
        },
        /** Adelanta el reloj simulado para comprobar vencimiento sin bloquear la ejecución. */
        avanzar: ms => {
            ahora += ms;
        }, 
/** Dispara los temporizadores registrados por la sesión simulada para comprobar sus efectos. */
        ejecutar: () => {
            for (const timer of [...temporizadores.values()])
                timer.fn();
        } };
}
test('Sin token no consulta /me ni autentica', /** Verifica el caso «Sin token no consulta /me ni autentica»; una aserción fallida invalida este resultado. */ async () => {
    const f = preparar();
    await f.session.recuperar();
    assert.equal(f.session.getSnapshot().estado, 'anonimo');
    assert.equal(f.consultas, 0);
});
test('Restauración bloquea vistas hasta que /me responde y conserva exp original', /** Verifica el caso «Restauración bloquea vistas hasta que /me responde y conserva exp original»; una aserción fallida invalida este resultado. */ async () => {
    let completar;
    const token = jwt(base / 1000 + 100);
    const f = preparar({ token, 
/** Configura la respuesta o rechazo simulado de /me para este escenario de sesión. */
        perfil: () => new Promise(/** Enlaza la finalización asíncrona del recurso o respuesta controlada con la promesa que espera la prueba. */  resolve => {
            completar = resolve;
        }) });
    const pendiente = f.session.recuperar();
    assert.equal(f.session.getSnapshot().estado, 'verificando');
    assert.equal(f.session.getSnapshot().sesion, null);
    completar({ usuario });
    await pendiente;
    assert.equal(f.session.getSnapshot().sesion.venceEn, base + 100000);
    assert.equal(f.token, token);
});
test('Login persiste solo después de /me y recargar no concede otros 900 segundos', /** Verifica el caso «Login persiste solo después de /me y recargar no concede otros 900 segundos»; una aserción fallida invalida este resultado. */ async () => {
    const f = preparar();
    await f.session.recuperar();
    await f.session.ingresar({ identificador: 'prueba', contrasena: 'prueba' });
    assert.equal(f.session.getSnapshot().estado, 'autenticado');
    assert.ok(f.token);
    const vencimiento = f.session.getSnapshot().sesion.venceEn;
    f.avanzar(450000);
    await f.session.recuperar();
    assert.equal(f.session.getSnapshot().sesion.venceEn, vencimiento);
});
test('Credenciales incorrectas no almacenan token', /** Verifica el caso «Credenciales incorrectas no almacenan token»; una aserción fallida invalida este resultado. */ async () => {
    const f = preparar({
        /** Rechaza el login con 401 para comprobar que no se persista un JWT. */
        login: async () => {
            throw new ApiError(401, 'Credenciales incorrectas');
        }
    });
    await f.session.recuperar();
    await f.session.ingresar({ identificador: 'prueba', contrasena: 'incorrecta' });
    assert.equal(f.session.getSnapshot().estado, 'anonimo');
    assert.equal(f.token, null);
    assert.match(f.session.getSnapshot().error, /incorrectas/);
});
test('JWT malformado o vencido se elimina antes de consultar /me', /** Verifica el caso «JWT malformado o vencido se elimina antes de consultar /me»; una aserción fallida invalida este resultado. */ async () => {
    for (const token of ['invalido', jwt(base / 1000 - 1)]) {
        const f = preparar({ token });
        await f.session.recuperar();
        assert.equal(f.session.getSnapshot().estado, 'anonimo');
        assert.equal(f.token, null);
        assert.equal(f.consultas, 0);
    }
    assert.throws(/** Ejecuta la operación del caso «JWT malformado o vencido se elimina antes de consultar /me» para comprobar su rechazo o excepción esperada. */ () => obtenerVencimiento('e30.e30.firma'));
});
test('/me rechaza JWT con firma inválida: 401/403 eliminan el token y bloquean acceso', /** Verifica el caso «/me rechaza JWT con firma inválida: 401/403 eliminan el token y bloquean acceso»; una aserción fallida invalida este resultado. */ async () => {
    for (const status of [401, 403]) {
        const f = preparar({ token: jwt(base / 1000 + 900), 
/** Configura la respuesta o rechazo simulado de /me para este escenario de sesión. */
            perfil: async () => {
                throw new ApiError(status, 'Rechazado');
            } });
        await f.session.recuperar();
        assert.equal(f.session.getSnapshot().estado, 'anonimo');
        assert.equal(f.token, null);
        assert.equal(f.consultas, 1);
    }
});
test('Fallo de conexión conserva token vigente sin contenido privado y permite reintentar', /** Verifica el caso «Fallo de conexión conserva token vigente sin contenido privado y permite reintentar»; una aserción fallida invalida este resultado. */ async () => {
    let falla = true;
    const f = preparar({ token: jwt(base / 1000 + 900), 
/** Configura la respuesta o rechazo simulado de /me para este escenario de sesión. */
        perfil: async () => {
            if (falla)
                throw new ApiError(0, 'Sin conexión');
            return { usuario };
        } });
    await f.session.recuperar();
    assert.equal(f.session.getSnapshot().estado, 'error');
    assert.equal(f.session.getSnapshot().sesion, null);
    assert.ok(f.token);
    falla = false;
    await f.session.recuperar();
    assert.equal(f.session.getSnapshot().estado, 'autenticado');
});
test('El vencimiento elimina token aun durante una caída del backend', /** Verifica el caso «El vencimiento elimina token aun durante una caída del backend»; una aserción fallida invalida este resultado. */ async () => {
    const f = preparar({ token: jwt(base / 1000 + 10), 
/** Configura la respuesta o rechazo simulado de /me para este escenario de sesión. */
        perfil: async () => {
            throw new ApiError(500, 'No disponible');
        } });
    await f.session.recuperar();
    f.avanzar(10001);
    f.ejecutar();
    assert.equal(f.token, null);
    assert.equal(f.session.getSnapshot().estado, 'anonimo');
});
test('Reloj al navegar/foco y temporizador cierran sesión sin ampliar vencimiento', /** Verifica el caso «Reloj al navegar/foco y temporizador cierran sesión sin ampliar vencimiento»; una aserción fallida invalida este resultado. */ async () => {
    for (const temporizador of [false, true]) {
        const f = preparar({ token: jwt(base / 1000 + 10) });
        await f.session.recuperar();
        f.avanzar(10001);
        if (temporizador)
            f.ejecutar();
        else
            f.session.comprobarVencimiento();
        assert.equal(f.token, null);
        assert.equal(f.session.getSnapshot().sesion, null);
    }
});
test('Logout limpia sesión y descarta respuestas pendientes de /me', /** Verifica el caso «Logout limpia sesión y descarta respuestas pendientes de /me»; una aserción fallida invalida este resultado. */ async () => {
    let completar;
    const f = preparar({ token: jwt(base / 1000 + 900), 
/** Configura la respuesta o rechazo simulado de /me para este escenario de sesión. */
        perfil: () => new Promise(/** Enlaza la finalización asíncrona del recurso o respuesta controlada con la promesa que espera la prueba. */  resolve => {
            completar = resolve;
        }) });
    const pendiente = f.session.recuperar();
    f.session.cerrarSesion();
    completar({ usuario });
    await pendiente;
    assert.equal(f.token, null);
    assert.equal(f.session.getSnapshot().estado, 'anonimo');
});
test('La recuperación pendiente no retrasa exp ni puede resucitar un token ya vencido', /** Verifica el caso «La recuperación pendiente no retrasa exp ni puede resucitar un token ya vencido»; una aserción fallida invalida este resultado. */ async () => {
    let completar;
    const f = preparar({ token: jwt(base / 1000 + 10), 
/** Configura la respuesta o rechazo simulado de /me para este escenario de sesión. */
        perfil: () => new Promise(/** Enlaza la finalización asíncrona del recurso o respuesta controlada con la promesa que espera la prueba. */  resolve => {
            completar = resolve;
        }) });
    const pendiente = f.session.recuperar();
    f.avanzar(10001);
    f.ejecutar();
    assert.equal(f.token, null);
    completar({ usuario });
    await pendiente;
    assert.equal(f.session.getSnapshot().estado, 'anonimo');
});
test('Almacenamiento bloqueado o perfil incompatible no producen autenticación parcial', /** Verifica el caso «Almacenamiento bloqueado o perfil incompatible no producen autenticación parcial»; una aserción fallida invalida este resultado. */ async () => {
    for (const opciones of [{ guardarFalla: true }, {
            /** Devuelve una identidad distinta del login para impedir una autenticación parcial. */
            perfil: async () => ({ usuario: { ...usuario, id: '2' } })
        }]) {
        const f = preparar(opciones);
        await f.session.recuperar();
        await f.session.ingresar({ identificador: 'prueba', contrasena: 'prueba' });
        assert.equal(f.session.getSnapshot().sesion, null);
        assert.equal(f.token, null);
        assert.ok(f.session.getSnapshot().error);
    }
});
test('401 autenticado invalida sesión; 403 de otra operación conserva identidad', /** Verifica el caso «401 autenticado invalida sesión; 403 de otra operación conserva identidad»; una aserción fallida invalida este resultado. */ async () => {
    const original = globalThis.fetch;
    const f = preparar({ token: jwt(base / 1000 + 900) });
    try {
        f.session.iniciar();
        await new Promise(/** Cede un turno del bucle de eventos para que termine la notificación asíncrona del caso. */  resolve => setImmediate(resolve));
        for (const status of [403, 401]) {
            globalThis.fetch = /** Sustituye Fetch por la respuesta controlada y captura la petición del caso, sin utilizar red ni credenciales reales. */
                async () => new Response('{}', { status });
            await assert.rejects(apiRequest('/api/privada', {
                /** Acepta el contrato ficticio; este caso comprueba el estado HTTP, no el esquema de contenido. */
                safeParse: () => ({ success: true })
            }, {}, f.token));
            assert.equal(f.session.getSnapshot().estado, status === 403 ? 'autenticado' : 'anonimo');
        }
    }
    finally {
        f.session.detener();
        globalThis.fetch = original;
    }
});
test('Temporizadores nativos no reciben el adaptador como contexto (regresión Illegal invocation)', /** Verifica el caso «Temporizadores nativos no reciben el adaptador como contexto (regresión Illegal invocation)»; una aserción fallida invalida este resultado. */ async () => {
    const programar = globalThis.setTimeout;
    const cancelar = globalThis.clearTimeout;
    globalThis.setTimeout = /** Simula el temporizador nativo y rechaza un contexto incorrecto para detectar la regresión Illegal invocation. */
        function () {
            if (this && this !== globalThis)
                throw new TypeError('Illegal invocation');
            return 1;
        };
    globalThis.clearTimeout = /** Simula la cancelación nativa y rechaza un contexto incorrecto para detectar la regresión Illegal invocation. */
        function () {
            if (this && this !== globalThis)
                throw new TypeError('Illegal invocation');
        };
    const session = new AuthSession({
        /** Devuelve el instante controlado por la prueba sin depender del reloj real. */
        ahora: () => base,
        storage: {
            /** Devuelve el JWT del fixture sin acceder al almacenamiento del navegador. */
            leer: () => jwt(base / 1000 + 900), 
            /** Adaptador deliberadamente vacío: esta regresión verifica el contexto de temporizadores, no la persistencia. */
            guardar() {
            }, 
            /** Adaptador deliberadamente vacío que evita tocar el almacenamiento real al cerrar el fixture. */
            eliminar() {
            }
        },
        api: {
            /** Falla si se intenta autenticar: este escenario debe usar únicamente recuperación mediante /me. */
            iniciarSesion: async () => {
                throw new Error('No usado');
            }, 
/** Simula /me con el perfil o comportamiento configurado por el caso y permite contar sus solicitudes. */
            obtenerMiUsuario: async () => ({ usuario })
        },
    });
    try {
        await session.recuperar();
        assert.equal(session.getSnapshot().estado, 'autenticado');
        session.cerrarSesion();
        assert.equal(session.getSnapshot().estado, 'anonimo');
    }
    finally {
        globalThis.setTimeout = programar;
        globalThis.clearTimeout = cancelar;
    }
});
test('Revalidaciones simultáneas comparten /me pendiente y vuelven a consultar después', /** Verifica el caso «Revalidaciones simultáneas comparten /me pendiente y vuelven a consultar después»; una aserción fallida invalida este resultado. */ async () => {
    let completar;
    const f = preparar({ token: jwt(base / 1000 + 900), 
/** Configura la respuesta o rechazo simulado de /me para este escenario de sesión. */
        perfil: () => new Promise(/** Enlaza la finalización asíncrona del recurso o respuesta controlada con la promesa que espera la prueba. */  resolve => {
            completar = resolve;
        }) });
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
test('Logout separa una nueva recuperación de la anterior y evita resucitar sesiones', /** Verifica el caso «Logout separa una nueva recuperación de la anterior y evita resucitar sesiones»; una aserción fallida invalida este resultado. */ async () => {
    let completar;
    const f = preparar({ token: jwt(base / 1000 + 900), 
/** Configura la respuesta o rechazo simulado de /me para este escenario de sesión. */
        perfil: () => new Promise(/** Enlaza la finalización asíncrona del recurso o respuesta controlada con la promesa que espera la prueba. */  resolve => {
            completar = resolve;
        }) });
    const anterior = f.session.recuperar();
    f.session.cerrarSesion();
    await f.session.recuperar();
    assert.equal(f.session.getSnapshot().estado, 'anonimo');
    completar({ usuario });
    await anterior;
    assert.equal(f.session.getSnapshot().estado, 'anonimo');
    assert.equal(f.token, null);
});
