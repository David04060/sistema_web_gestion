/** Archivo: Comparte una única sesión entre formularios, navegación y páginas protegidas.
 */
import { createContext } from 'react';
import type { AuthSession } from '../services/AuthSession';
/** Una sola instancia compartida por login, navegación y vistas protegidas. */
export const AuthContext = createContext<AuthSession | null>(null);
