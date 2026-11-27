/** Archivo: Inicia React y proporciona navegación y sesión al resto de la interfaz.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './features/auth/context/AuthProvider';
const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el contenedor principal de React.');
createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
