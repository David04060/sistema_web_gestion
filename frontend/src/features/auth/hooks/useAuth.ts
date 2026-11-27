/** Archivo: Permite a los componentes leer la sesión y ejecutar acceso, recuperación y cierre.
 */
import { useContext, useSyncExternalStore } from 'react';
import { AuthContext } from '../context/AuthContext';
/** Suscribe cada consumidor al mismo estado; usar exclusivamente dentro de AuthProvider. */
export function useAuth() {
  const session = useContext(AuthContext);
  if (!session) throw new Error('useAuth requiere AuthProvider.');
  const estado = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return {
    ...estado,
    ingresar: session.ingresar,
    cerrarSesion: session.cerrarSesion,
    recuperar: session.recuperar,
    comprobarVencimiento: session.comprobarVencimiento,
  };
}
