/** Archivo: Muestra el estado de conexión y las rutas principales de la aplicación.
 */
import { AppRoutes } from './routes/AppRoutes';
import { EstadoConectividad } from './components/ui/EstadoConectividad';
/** Punto de composición; el proveedor mantiene sesión y las rutas deciden navegación. */
export default function App() {
  return (
    <>
      <EstadoConectividad />
      <AppRoutes />
    </>
  );
}
