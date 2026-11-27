/** Archivo: Crea la sesión y comprueba su validez al regresar a la pestaña.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { AuthContext } from './AuthContext';
import { AuthSession } from '../services/AuthSession';
/** Inicializa la sesión y revalida con Express al volver a una pestaña o página restaurada. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session] = useState(() => new AuthSession());
  useEffect(() => {
    session.iniciar();
    /**
     * Revalida con /me al regresar a una pestaña visible, salvo cuando la sesión ya es anónima.
     */
    const validar = () => {
      if (document.visibilityState === 'visible' && session.getSnapshot().estado !== 'anonimo') {
        void session.revalidarAlVolver();
      }
    };
    window.addEventListener('focus', validar);
    window.addEventListener('pageshow', validar);
    document.addEventListener('visibilitychange', validar);
    return () => {
      window.removeEventListener('focus', validar);
      window.removeEventListener('pageshow', validar);
      document.removeEventListener('visibilitychange', validar);
      session.detener();
    };
  }, [session]);
  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>;
}
