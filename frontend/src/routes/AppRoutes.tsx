import { ErrorRuta } from '../components/ui/ErrorRuta';
import { CargaRuta } from '../components/ui/CargaRuta';
import { lazy, Suspense, useEffect } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/hooks/useAuth';
import { useAccesoSiseve } from '../features/siseve/hooks/useAccesoSiseve';
import styles from '../components/ui/EstadoPagina.module.css';
/** Las factorías se declaran fuera del render; los guards deciden qué pantalla llega a cargarse. */
const AdminLayout = lazy(/** Descarga la pantalla AdminLayout únicamente cuando su ruta autorizada se renderiza. */() => import('../components/layout/AdminLayout').then(/** Adapta la exportación AdminLayout al contrato default requerido por React.lazy. */  m => ({ default: m.AdminLayout })));
const LoginPage = lazy(/** Descarga la pantalla LoginPage únicamente cuando su ruta autorizada se renderiza. */() => import('../features/auth/pages/LoginPage').then(/** Adapta la exportación LoginPage al contrato default requerido por React.lazy. */  m => ({ default: m.LoginPage })));
const DashboardPage = lazy(/** Descarga la pantalla DashboardPage únicamente cuando su ruta autorizada se renderiza. */() => import('../features/dashboard/pages/DashboardPage').then(/** Adapta la exportación DashboardPage al contrato default requerido por React.lazy. */  m => ({ default: m.DashboardPage })));
const SisevePage = lazy(/** Descarga la pantalla SisevePage únicamente cuando su ruta autorizada se renderiza. */() => import('../features/siseve/pages/SisevePage').then(/** Adapta la exportación SisevePage al contrato default requerido por React.lazy. */  m => ({ default: m.SisevePage })));
const SiseveAdministracionPage = lazy(/** Descarga la pantalla SiseveAdministracionPage únicamente cuando su ruta autorizada se renderiza. */() => import('../features/siseve/pages/SiseveAdministracionPage').then(/** Adapta la exportación SiseveAdministracionPage al contrato default requerido por React.lazy. */  m => ({ default: m.SiseveAdministracionPage })));
const DocumentoFormularioPage = lazy(/** Descarga la pantalla DocumentoFormularioPage únicamente cuando su ruta autorizada se renderiza. */() => import('../features/documentos/pages/DocumentoFormularioPage').then(/** Adapta la exportación DocumentoFormularioPage al contrato default requerido por React.lazy. */  m => ({ default: m.DocumentoFormularioPage })));
const DocumentosListaPage = lazy(/** Descarga la pantalla DocumentosListaPage únicamente cuando su ruta autorizada se renderiza. */() => import('../features/documentos/pages/DocumentosListaPage').then(/** Adapta la exportación DocumentosListaPage al contrato default requerido por React.lazy. */  m => ({ default: m.DocumentosListaPage })));
const DocumentoDetallePage = lazy(/** Descarga la pantalla DocumentoDetallePage únicamente cuando su ruta autorizada se renderiza. */() => import('../features/documentos/pages/DocumentoDetallePage').then(/** Adapta la exportación DocumentoDetallePage al contrato default requerido por React.lazy. */  m => ({ default: m.DocumentoDetallePage })));
const MovimientosListaPage = lazy(/** Descarga la pantalla MovimientosListaPage únicamente cuando su ruta autorizada se renderiza. */() => import('../features/movimientos/pages/MovimientosPages').then(/** Adapta la exportación MovimientosListaPage al contrato default requerido por React.lazy. */  m => ({ default: m.MovimientosListaPage })));
const MovimientoDetallePage = lazy(/** Descarga la pantalla MovimientoDetallePage únicamente cuando su ruta autorizada se renderiza. */() => import('../features/movimientos/pages/MovimientosPages').then(/** Adapta la exportación MovimientoDetallePage al contrato default requerido por React.lazy. */  m => ({ default: m.MovimientoDetallePage })));
const UsuariosListaPage = lazy(/** Descarga la pantalla UsuariosListaPage únicamente cuando su ruta autorizada se renderiza. */() => import('../features/usuarios/pages/UsuariosListaPage').then(/** Adapta la exportación UsuariosListaPage al contrato default requerido por React.lazy. */  m => ({ default: m.UsuariosListaPage })));
const UsuarioFormularioPage = lazy(/** Descarga la pantalla UsuarioFormularioPage únicamente cuando su ruta autorizada se renderiza. */() => import('../features/usuarios/pages/UsuarioFormularioPage').then(/** Adapta la exportación UsuarioFormularioPage al contrato default requerido por React.lazy. */  m => ({ default: m.UsuarioFormularioPage })));
const UsuarioDetallePage = lazy(/** Descarga la pantalla UsuarioDetallePage únicamente cuando su ruta autorizada se renderiza. */() => import('../features/usuarios/pages/UsuarioDetallePage').then(/** Adapta la exportación UsuarioDetallePage al contrato default requerido por React.lazy. */  m => ({ default: m.UsuarioDetallePage })));
const Roles = {
    Lista: lazy(/** Descarga la pantalla Lista únicamente cuando su ruta autorizada se renderiza. */() => import('../features/roles/pages/RolesPages').then(/** Adapta la exportación Lista al contrato default requerido por React.lazy. */  m => ({ default: m.Lista }))),
    Detalle: lazy(/** Descarga la pantalla Detalle únicamente cuando su ruta autorizada se renderiza. */() => import('../features/roles/pages/RolesPages').then(/** Adapta la exportación Detalle al contrato default requerido por React.lazy. */  m => ({ default: m.Detalle }))),
    Formulario: lazy(/** Descarga la pantalla Formulario únicamente cuando su ruta autorizada se renderiza. */() => import('../features/roles/pages/RolesPages').then(/** Adapta la exportación Formulario al contrato default requerido por React.lazy. */  m => ({ default: m.Formulario }))),
};
const Oficinas = {
    Lista: lazy(/** Descarga la pantalla Lista únicamente cuando su ruta autorizada se renderiza. */() => import('../features/oficinas/pages/OficinasPages').then(/** Adapta la exportación Lista al contrato default requerido por React.lazy. */  m => ({ default: m.Lista }))),
    Detalle: lazy(/** Descarga la pantalla Detalle únicamente cuando su ruta autorizada se renderiza. */() => import('../features/oficinas/pages/OficinasPages').then(/** Adapta la exportación Detalle al contrato default requerido por React.lazy. */  m => ({ default: m.Detalle }))),
    Formulario: lazy(/** Descarga la pantalla Formulario únicamente cuando su ruta autorizada se renderiza. */() => import('../features/oficinas/pages/OficinasPages').then(/** Adapta la exportación Formulario al contrato default requerido por React.lazy. */  m => ({ default: m.Formulario }))),
};
const Tipos = {
    ListaTiposPage: lazy(/** Descarga la pantalla ListaTiposPage únicamente cuando su ruta autorizada se renderiza. */() => import('../features/tipos-documentales/pages/TiposPages').then(/** Adapta la exportación ListaTiposPage al contrato default requerido por React.lazy. */  m => ({ default: m.ListaTiposPage }))),
    DetalleTipoPage: lazy(/** Descarga la pantalla DetalleTipoPage únicamente cuando su ruta autorizada se renderiza. */() => import('../features/tipos-documentales/pages/TiposPages').then(/** Adapta la exportación DetalleTipoPage al contrato default requerido por React.lazy. */  m => ({ default: m.DetalleTipoPage }))),
    FormularioTipoPage: lazy(/** Descarga la pantalla FormularioTipoPage únicamente cuando su ruta autorizada se renderiza. */() => import('../features/tipos-documentales/pages/TiposPages').then(/** Adapta la exportación FormularioTipoPage al contrato default requerido por React.lazy. */  m => ({ default: m.FormularioTipoPage }))),
};
const Ubicaciones = {
    UbicacionesPage: lazy(/** Descarga la pantalla UbicacionesPage únicamente cuando su ruta autorizada se renderiza. */() => import('../features/ubicaciones/pages/UbicacionesPages').then(/** Adapta la exportación UbicacionesPage al contrato default requerido por React.lazy. */  m => ({ default: m.UbicacionesPage }))),
    FormularioEstantePage: lazy(/** Descarga la pantalla FormularioEstantePage únicamente cuando su ruta autorizada se renderiza. */() => import('../features/ubicaciones/pages/UbicacionesPages').then(/** Adapta la exportación FormularioEstantePage al contrato default requerido por React.lazy. */  m => ({ default: m.FormularioEstantePage }))),
    DetalleEstantePage: lazy(/** Descarga la pantalla DetalleEstantePage únicamente cuando su ruta autorizada se renderiza. */() => import('../features/ubicaciones/pages/UbicacionesPages').then(/** Adapta la exportación DetalleEstantePage al contrato default requerido por React.lazy. */  m => ({ default: m.DetalleEstantePage }))),
    FormularioArchivadorPage: lazy(/** Descarga la pantalla FormularioArchivadorPage únicamente cuando su ruta autorizada se renderiza. */() => import('../features/ubicaciones/pages/UbicacionesPages').then(/** Adapta la exportación FormularioArchivadorPage al contrato default requerido por React.lazy. */  m => ({ default: m.FormularioArchivadorPage }))),
    DetalleArchivadorPage: lazy(/** Descarga la pantalla DetalleArchivadorPage únicamente cuando su ruta autorizada se renderiza. */() => import('../features/ubicaciones/pages/UbicacionesPages').then(/** Adapta la exportación DetalleArchivadorPage al contrato default requerido por React.lazy. */  m => ({ default: m.DetalleArchivadorPage }))),
};
/** Bloquea las pantallas mientras /me decide. Una caída de red ofrece recuperación explícita. */
function EstadoSesion() {
    const auth = useAuth();
    return <main className={styles.pagina}>
        <section className={styles.tarjeta}>
            {auth.estado === 'error' ? <>
                <h1>No se pudo verificar la sesión</h1>
                <p role="alert">
                    {auth.error}
                </p>
                <div className={styles.acciones}>
                    <button onClick={/** Reintenta la verificación de sesión sin volver a enviar credenciales. */() => {
                        void auth.recuperar();
                    }}>Reintentar</button>
                    <button onClick={auth.cerrarSesion}>Volver al login</button>
                </div>
            </> : <p role="status" aria-live="polite">Verificando tu sesión…</p>}
        </section>
    </main>;
}
/** Puerta común: también comprueba el reloj al cambiar de ruta, antes de mostrar vistas privadas. */
function SesionVerificada() {
    const auth = useAuth();
    const location = useLocation();
    const vencida = !!auth.sesion && auth.sesion.venceEn <= Date.now();
    useEffect(/** Comprueba el vencimiento absoluto al cambiar la ruta antes de conservar acceso privado. */() => {
        auth.comprobarVencimiento();
    }, [location.key, auth.comprobarVencimiento]);
    if (auth.estado === 'verificando' || auth.estado === 'error' || vencida)
        return <EstadoSesion />;
    return <Outlet />;
}
/** La protección visual no sustituye requiereAuth en Express. replace evita volver al login anterior. */
function RutaPrivada() {
    const { sesion } = useAuth();
    return sesion ? <Outlet /> : <Navigate to="/login" replace />;
}
/**
 * Redirige una sesión autenticada al panel o muestra el formulario conectado al gestor de sesión.
 */
function Acceso() {
    const auth = useAuth();
    if (auth.sesion)
        return <Navigate to="/dashboard" replace />;
    return <LoginPage cargando={auth.cargando} error={auth.error} mensaje={auth.mensaje} onIngresar={auth.ingresar} />;
}
/**
 * Entrega el perfil verificado al Dashboard únicamente mientras existe una sesión autenticada.
 */
function Panel() {
    const auth = useAuth();
    return auth.sesion ? <DashboardPage usuario={auth.sesion.usuario} /> : null;
}
/** Un 403 visual conserva la sesión; las mismas operaciones se autorizan nuevamente en Express. */
function SoloAdministrador() {
    const auth = useAuth();
    return auth.sesion?.usuario.rol === 'Administrador' ? <Outlet /> :
        <main className={styles.pagina}>
            <section className={styles.tarjeta}>
                <h1>Acceso no autorizado</h1>
                <p>Estos módulos están disponibles únicamente para el Administrador.</p>
                <Link to="/dashboard">Volver al dashboard</Link>
            </section>
        </main>;
}
/**
 * Resuelve la entrada del sistema hacia el panel o el login según la sesión verificada.
 */
function Inicio() {
    const { sesion } = useAuth();
    return <Navigate to={sesion ? '/dashboard' : '/login'} replace />;
}
/** Desmonta resultados y formularios restringidos cuando sus permisos requieren nueva comprobación. */
function VerificacionSiseve() {
    const auth = useAuth();
    const acceso = useAccesoSiseve();
    if (auth.revalidando || acceso.cargando || !acceso.datos) {
        return <main className={styles.pagina}>
            {acceso.error ? <div role="alert">
                {acceso.error}<button onClick={acceso.recargar}>Reintentar</button>
            </div> : <p role="status">Verificando acceso a SíseVe…</p>}
        </main>;
    }
    return <Outlet />;
}
/** Presenta la ruta inexistente y un enlace de regreso apropiado para la sesión. */
function NoEncontrada() {
    const { sesion } = useAuth();
    return <main className={styles.pagina}>
        <section className={styles.tarjeta}>
            <h1>404 · Página no encontrada</h1>
            <p>La dirección solicitada no existe en el sistema.</p>
            <div className={styles.acciones}>
                <Link to={sesion ? '/dashboard' : '/login'} replace>Volver al inicio</Link>
            </div>
        </section>
    </main>;
}
/** Tabla de navegación real, sin manipulación de window.location ni módulos adicionales. */
export function AppRoutes() {
    const location = useLocation();
    return <ErrorRuta ruta={location.pathname}>
        <Suspense fallback={<CargaRuta />}>
            <Routes>
                <Route element={<SesionVerificada />}>
                    <Route path="/" element={<Inicio />} />
                    <Route path="/login" element={<Acceso />} />
                    <Route element={<RutaPrivada />}>
                        <Route element={<AdminLayout />}>
                            <Route path="/dashboard" element={<Panel />} />
                            <Route element={<VerificacionSiseve />}>
                                <Route path="/siseve" element={<SisevePage />} />
                            </Route>
                            <Route path="/documentos" element={<DocumentosListaPage />} />
                            <Route path="/documentos/nuevo" element={<DocumentoFormularioPage />} />
                            <Route path="/documentos/:id/editar" element={<DocumentoFormularioPage />} />
                            <Route path="/documentos/:id" element={<DocumentoDetallePage />} />
                            <Route path="/movimientos" element={<MovimientosListaPage />} />
                            <Route path="/movimientos/:id" element={<MovimientoDetallePage />} />
                            <Route path="/tipos-documentales" element={<Tipos.ListaTiposPage />} />
                            <Route path="/tipos-documentales/:id" element={<Tipos.DetalleTipoPage />} />
                            <Route path="/ubicaciones" element={<Ubicaciones.UbicacionesPage />} />
                            <Route path="/ubicaciones/estantes/nuevo" element={<Ubicaciones.FormularioEstantePage />} />
                            <Route path="/ubicaciones/estantes/:id" element={<Ubicaciones.DetalleEstantePage />} />
                            <Route path="/ubicaciones/estantes/:id/editar" element={<Ubicaciones.FormularioEstantePage />} />
                            <Route path="/ubicaciones/archivadores/nuevo" element={<Ubicaciones.FormularioArchivadorPage />} />
                            <Route path="/ubicaciones/archivadores/:id" element={<Ubicaciones.DetalleArchivadorPage />} />
                            <Route path="/ubicaciones/archivadores/:id/editar" element={<Ubicaciones.FormularioArchivadorPage />} />
                            <Route element={<SoloAdministrador />}>
                                <Route element={<VerificacionSiseve />}>
                                    <Route path="/siseve/administracion" element={<SiseveAdministracionPage />} />
                                </Route>
                                <Route path="/tipos-documentales/nuevo" element={<Tipos.FormularioTipoPage />} />
                                <Route path="/tipos-documentales/:id/editar" element={<Tipos.FormularioTipoPage />} />
                                <Route path="/roles" element={<Roles.Lista />} />
                                <Route path="/roles/nuevo" element={<Roles.Formulario />} />
                                <Route path="/roles/:id" element={<Roles.Detalle />} />
                                <Route path="/roles/:id/editar" element={<Roles.Formulario />} />
                                <Route path="/oficinas" element={<Oficinas.Lista />} />
                                <Route path="/oficinas/nuevo" element={<Oficinas.Formulario />} />
                                <Route path="/oficinas/:id" element={<Oficinas.Detalle />} />
                                <Route path="/oficinas/:id/editar" element={<Oficinas.Formulario />} />
                                <Route path="/usuarios" element={<UsuariosListaPage />} />
                                <Route path="/usuarios/nuevo" element={<UsuarioFormularioPage />} />
                                <Route path="/usuarios/:id" element={<UsuarioDetallePage />} />
                                <Route path="/usuarios/:id/editar" element={<UsuarioFormularioPage />} />
                            </Route>
                        </Route>
                    </Route>
                    <Route path="*" element={<NoEncontrada />} />
                </Route>
            </Routes>
        </Suspense>
    </ErrorRuta>;
}
