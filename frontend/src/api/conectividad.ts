/** Archivo: Detecta solicitudes lentas y reintenta lecturas permitidas sin repetir escrituras.
 */
let lentas = 0;
const listeners = new Set<() => void>();
export const estadoConectividad = () => lentas > 0;
export const suscribirConectividad = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
/** Aviso temporal sin inferir que un fallo de red sea autenticación correcta. */
function observarDemora() {
  let lenta = false;
  const timer = setTimeout(() => {
    lenta = true;
    lentas++;
    listeners.forEach((l) => l());
  }, 8000);
  return () => {
    clearTimeout(timer);
    if (lenta) {
      lentas--;
      listeners.forEach((l) => l());
    }
  };
}
/** A lo sumo dos intentos GET: 15 s y 50 s. Nunca repite escrituras, login ni solicitudes con señal explícita. */
export async function solicitar(
  url: string,
  opciones: RequestInit,
  ruta: string,
): Promise<{ respuesta: Response; texto: string }> {
  const lectura =
    (opciones.method ?? 'GET').toUpperCase() === 'GET' &&
    !opciones.body &&
    !opciones.signal;
  const terminar = observarDemora();
  try {
    for (let intento = 0; intento < (lectura ? 2 : 1); intento++) {
      try {
        const respuesta = await fetch(url, {
          ...opciones,
          cache: 'no-store',
          signal:
            opciones.signal ??
            AbortSignal.timeout(ruta === '/api/auth/login' ? 65000 : intento === 0 ? 15000 : 50000),
        });
        const texto = await respuesta.text();
        if (lectura && intento === 0 && [502, 503, 504].includes(respuesta.status)) continue;
        return { respuesta, texto };
      } catch (fallo) {
        if (!lectura || intento !== 0) throw fallo;
      }
    }
    throw new Error('Solicitud no completada');
  } finally {
    terminar();
  }
}
