import { AppRoutes } from './routes/AppRoutes';
/** Punto de composición; el proveedor mantiene sesión y las rutas deciden navegación. */
export default function App() {
    return <AppRoutes />;
}
