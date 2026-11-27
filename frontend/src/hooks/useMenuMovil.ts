/** Archivo: Abre y cierra el menú móvil y libera el diálogo al pasar a una pantalla amplia.
 */
import { useEffect, useRef } from 'react';
/**
 * Mantiene el diálogo móvil fuera de la composición visual del layout.
 * Cierra el modal al pasar a escritorio y retira el observador al desmontarse.
 * @returns Referencia al diálogo y operaciones nativas de apertura y cierre.
 */
export function useMenuMovil() {
  const dialogo = useRef<HTMLDialogElement>(null);
  /** Abre la navegación con la gestión de foco y Escape del diálogo nativo. */
  const abrir = () => dialogo.current?.showModal();
  /** Cierra la navegación al elegir una ruta o pulsar el cierre explícito. */
  const cerrar = () => dialogo.current?.close();
  useEffect(() => {
    const media = window.matchMedia('(min-width: 901px)');
    /** Libera el foco modal cuando el menú fijo de escritorio pasa a estar disponible. */
    const cerrarEnEscritorio = () => {
      if (media.matches) dialogo.current?.close();
    };
    media.addEventListener('change', cerrarEnEscritorio);
    return () => media.removeEventListener('change', cerrarEnEscritorio);
  }, []);
  return { dialogo, abrir, cerrar };
}
