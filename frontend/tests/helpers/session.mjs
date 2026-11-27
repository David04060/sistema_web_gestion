/** Archivo: Carga módulos reales y proporciona sesión, reloj y almacenamiento controlados para las pruebas.
 */
import { resolve } from 'node:path';
import { build } from 'vite';

// El código productivo siempre usa la API real. Solo estas pruebas inyectan reloj,
// almacenamiento y transporte para reproducir fallos y vencimiento sin esperar una hora.
const result = await build({
  configFile: false,
  logLevel: 'silent',
  plugins: [
    {
      name: 'session-test-entry',
      /** Reconoce el identificador virtual que permite compilar contratos reales en memoria para estas pruebas. */
      resolveId(id) {
        if (id === 'virtual:session-test') return '\0virtual:session-test';
      },
      /**
       * Construye las exportaciones virtuales desde los módulos reales; evita mantener copias de sus
       * implementaciones en las pruebas.
       */
      load(id) {
        if (id !== '\0virtual:session-test') return;
        return [
          ['AuthSession', 'src/features/auth/services/AuthSession.ts'],
          ['ApiError, apiRequest', 'src/api/client.ts'],
          ['obtenerVencimiento', 'src/features/auth/services/sessionStorage.ts'],
          ['Consulta', 'src/hooks/consulta.ts'],
          ['observarRegreso', 'src/lib/regresoVisible.ts'],
          ['solicitar', 'src/api/conectividad.ts'],
        ]
          .map(
            ([exports, file]) =>
              `export {${exports}} from ${JSON.stringify(resolve(file).replaceAll('\\', '/'))};`,
          )
          .join('\n');
      },
    },
  ],
  build: {
    write: false,
    minify: false,
    rollupOptions: {
      input: 'virtual:session-test',
      preserveEntrySignatures: 'strict',
      output: { format: 'es', codeSplitting: false },
    },
  },
});
const chunk = (Array.isArray(result) ? result : [result])
  .flatMap((item) => item.output)
  .find((item) => item.type === 'chunk' && item.isEntry);
const { AuthSession, ApiError, apiRequest, obtenerVencimiento, Consulta, observarRegreso, solicitar } =
  await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
const usuario = {
  id: '1',
  nombre: 'Prueba',
  apellido: 'Local',
  nombre_usuario: 'prueba',
  email: null,
  rol: 'Prueba',
  oficina: null,
};
const base = 1800000000000;
/**
 * Construye un JWT ficticio con exp para probar el reloj del cliente; no contiene una firma válida para
 * el backend.
 */
const jwt = (exp) => `e30.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.firma-de-prueba`;
/**
 * Crea una sesión con almacenamiento, reloj, temporizadores y API controlados; devuelve adaptadores
 * para comprobar carreras y vencimiento.
 */
function preparar({ token = null, perfil, login, guardarFalla = false } = {}) {
  let almacenado = token;
  let ahora = base;
  let consultas = 0;
  const temporizadores = new Map();
  let siguiente = 0;
  const tokenLogin = jwt(base / 1000 + 3600);
  const session = new AuthSession({
    storage: {
      leer: () => almacenado,
      /**
       * Simula la persistencia del JWT en memoria, incluyendo el fallo de almacenamiento cuando lo solicita
       * el caso.
       */
      guardar: (value) => {
        if (guardarFalla) throw new Error('Almacenamiento no disponible');
        almacenado = value;
      },

      eliminar: () => {
        almacenado = null;
      },
    },

    ahora: () => ahora,
    /** Registra el temporizador simulado para permitir comprobar el vencimiento de forma determinista. */
    programar: (fn, ms) => {
      const id = ++siguiente;
      temporizadores.set(id, { fn, ms });
      return id;
    },

    cancelar: (id) => temporizadores.delete(id),
    api: {
      iniciarSesion:
        login ??
        /** Devuelve el login ficticio del caso con el mismo contrato y vencimiento de la API. */ (async () => ({
          token: tokenLogin,
          usuario,
          tipo: 'Bearer',
          expiresIn: 3600,
        })),

      obtenerMiUsuario: async (token) => {
        consultas++;
        return perfil ? perfil(token) : { usuario };
      },
    },
  });
  return {
    session,

    get token() {
      return almacenado;
    },

    get consultas() {
      return consultas;
    },
    /** Adelanta el reloj simulado para comprobar vencimiento sin bloquear la ejecución. */
    avanzar: (ms) => {
      ahora += ms;
    },
    /** Dispara los temporizadores registrados por la sesión simulada para comprobar sus efectos. */
    ejecutar: () => {
      for (const timer of [...temporizadores.values()]) timer.fn();
    },
  };
}
export {
  AuthSession,
  ApiError,
  apiRequest,
  obtenerVencimiento,
  Consulta,
  observarRegreso,
  solicitar,
  usuario,
  base,
  jwt,
  preparar,
};
