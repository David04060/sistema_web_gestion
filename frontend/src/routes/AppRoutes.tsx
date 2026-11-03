import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/hooks/useAuth';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { AdminLayout } from '../components/layout/AdminLayout';
import { CargaRuta } from '../components/ui/CargaRuta';
import { ErrorRuta } from '../components/ui/ErrorRuta';
import { rolesAdministracion, rolesDocumentales, rolesRegistro } from '../lib/perfiles';
import styles from '../components/ui/Admin.module.css';
const Dashboard = lazy(() =>
  import('../features/dashboard/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const Documentos = lazy(() =>
  import('../features/documentos/pages/DocumentosListaPage').then((m) => ({
    default: m.DocumentosListaPage,
  })),
);
const Formulario = lazy(() =>
  import('../features/documentos/pages/DocumentoFormularioPage').then((m) => ({
    default: m.DocumentoFormularioPage,
  })),
);
const Detalle = lazy(() =>
  import('../features/documentos/pages/DocumentoDetallePage').then((m) => ({
    default: m.DocumentoDetallePage,
  })),
);
const Usuarios = lazy(() =>
  import('../features/usuarios/pages/UsuariosListaPage').then((m) => ({
    default: m.UsuariosListaPage,
  })),
);
const UsuarioForm = lazy(() =>
  import('../features/usuarios/pages/UsuarioFormularioPage').then((m) => ({
    default: m.UsuarioFormularioPage,
  })),
);
const UsuarioDetalle = lazy(() =>
  import('../features/usuarios/pages/UsuarioDetallePage').then((m) => ({
    default: m.UsuarioDetallePage,
  })),
);
const Ubicaciones = lazy(() =>
  import('../features/ubicaciones/pages/UbicacionesPage').then((m) => ({
    default: m.UbicacionesPage,
  })),
);
const Tipos = lazy(() =>
  import('../features/usuarios/pages/TiposActualesPage').then((m) => ({
    default: m.TiposActualesPage,
  })),
);
const Oficinas = lazy(() =>
  import('../features/usuarios/pages/OficinasListaPage').then((m) => ({
    default: m.OficinasActualesPage,
  })),
);
const OficinaDetalle = lazy(() =>
  import('../features/usuarios/pages/OficinaDetallePage').then((m) => ({
    default: m.OficinaDetallePage,
  })),
);
const OficinaFormulario = lazy(() =>
  import('../features/usuarios/pages/OficinaFormularioPage').then((m) => ({
    default: m.OficinaFormularioPage,
  })),
);
const Roles = lazy(() =>
  import('../features/usuarios/pages/RolesActualesPage').then((m) => ({
    default: m.RolesActualesPage,
  })),
);
const Campos = lazy(() =>
  import('../features/usuarios/pages/CamposActualesPage').then((m) => ({
    default: m.CamposActualesPage,
  })),
);
function EstadoSesion() {
  const auth = useAuth();
  return (
    <main className={styles.pagina}>
      <section className={styles.tarjeta}>
        {auth.estado === 'error' ? (
          <>
            <h1>No se pudo verificar la sesión</h1>
            <p role="alert">{auth.error}</p>
            <button onClick={() => void auth.recuperar()}>Reintentar</button>
            <button onClick={auth.cerrarSesion}>Volver al login</button>
          </>
        ) : (
          <p role="status">Verificando tu sesión…</p>
        )}
      </section>
    </main>
  );
}
function SesionVerificada() {
  const auth = useAuth(),
    location = useLocation(),
    vencida = !!auth.sesion && auth.sesion.venceEn <= Date.now();
  useEffect(() => {
    auth.comprobarVencimiento();
  }, [location.key, auth.comprobarVencimiento]);
  if (auth.estado === 'verificando' || auth.estado === 'error' || vencida) return <EstadoSesion />;
  return <Outlet />;
}
function RutaPrivada() {
  return useAuth().sesion ? <Outlet /> : <Navigate to="/login" replace />;
}
function Acceso() {
  const auth = useAuth();
  return auth.sesion ? (
    <Navigate to="/dashboard" replace />
  ) : (
    <LoginPage
      cargando={auth.cargando}
      error={auth.error}
      mensaje={auth.mensaje}
      onIngresar={auth.ingresar}
    />
  );
}
function Permitidos({ roles }: { roles: string[] }) {
  const { sesion } = useAuth();
  return sesion && roles.includes(sesion.usuario.rol) ? (
    <Outlet />
  ) : (
    <main className={styles.pagina}>
      <h1>Acceso no autorizado</h1>
      <p>Este módulo no está disponible para tu perfil.</p>
      <Link to="/dashboard">Volver al inicio</Link>
    </main>
  );
}
function Inicio() {
  return <Navigate to={useAuth().sesion ? '/dashboard' : '/login'} replace />;
}
function NoEncontrada() {
  return (
    <main className={styles.pagina}>
      <h1>404 · Página no encontrada</h1>
      <Link to="/">Volver al inicio</Link>
    </main>
  );
}
export function AppRoutes() {
  const location = useLocation();
  return (
    <ErrorRuta ruta={location.pathname}>
      <Suspense fallback={<CargaRuta />}>
        <Routes>
          <Route element={<SesionVerificada />}>
            <Route path="/" element={<Inicio />} />
            <Route path="/login" element={<Acceso />} />
            <Route element={<RutaPrivada />}>
              <Route element={<AdminLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route element={<Permitidos roles={rolesDocumentales} />}>
                  <Route path="/documentos" element={<Documentos />} />
                  <Route path="/documentos/:id" element={<Detalle />} />
                </Route>
                <Route element={<Permitidos roles={rolesRegistro} />}>
                  <Route path="/documentos/nuevo" element={<Formulario />} />
                  <Route path="/documentos/:id/editar" element={<Formulario />} />
                  <Route path="/tipos-documentales" element={<Tipos />} />
                </Route>
                <Route path="/ubicaciones" element={<Ubicaciones />} />
                <Route element={<Permitidos roles={rolesAdministracion} />}>
                  <Route path="/usuarios" element={<Usuarios />} />
                  <Route path="/usuarios/nuevo" element={<UsuarioForm />} />
                  <Route path="/usuarios/:id" element={<UsuarioDetalle />} />
                  <Route path="/usuarios/:id/editar" element={<UsuarioForm />} />
                  <Route path="/roles" element={<Roles />} />
                  <Route path="/oficinas" element={<Oficinas />} />
                  <Route path="/oficinas/nuevo" element={<OficinaFormulario />} />
                  <Route path="/oficinas/:id" element={<OficinaDetalle />} />
                  <Route path="/oficinas/:id/editar" element={<OficinaFormulario />} />
                  <Route path="/campos-opcionales" element={<Campos />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<NoEncontrada />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorRuta>
  );
}
