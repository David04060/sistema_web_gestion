/** Archivo: Agrupa eventos de regreso a una pestaña para evitar comprobaciones repetidas en el mismo segundo.
 */
/** Agrupa eventos de un mismo regreso. No contiene datos ni concede autorización. */
export function observarRegreso(
  accion: () => void,
  ocultar?: () => void,
  ventana: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
  pagina: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> = document,
  ahora: () => number = Date.now,
) {
  let ultimo = ahora();
  const regresar = () => {
    if (pagina.visibilityState !== 'visible') {
      ultimo = -Infinity;
      ocultar?.();
      return;
    }
    if (ahora() - ultimo < 1000) return;
    ultimo = ahora();
    accion();
  };
  ventana.addEventListener('focus', regresar);
  ventana.addEventListener('pageshow', regresar);
  pagina.addEventListener('visibilitychange', regresar);
  return () => {
    ventana.removeEventListener('focus', regresar);
    ventana.removeEventListener('pageshow', regresar);
    pagina.removeEventListener('visibilitychange', regresar);
  };
}
