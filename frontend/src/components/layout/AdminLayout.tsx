import { Suspense } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AccesoSiseveProvider } from '../../features/siseve/context/AccesoSiseveProvider';
import { useAccesoSiseve } from '../../features/siseve/hooks/useAccesoSiseve';
import { useAuth } from '../../features/auth/hooks/useAuth';
import { useMenuMovil } from '../../hooks/useMenuMovil';
import { Icono, type IconName } from '../icons/Icono';
import { ErrorRuta } from '../ui/ErrorRuta';
import { CargaRuta } from '../ui/CargaRuta';
import styles from './AdminLayout.module.css';
interface Enlace {
    ruta: string;
    titulo: string;
    icono: IconName;
}
const gestion: Enlace[] = [
    { ruta: '/dashboard', titulo: 'Dashboard', icono: 'panel' },
    { ruta: '/documentos', titulo: 'Documentos', icono: 'documentos' },
    { ruta: '/movimientos', titulo: 'Movimientos', icono: 'movimientos' },
    { ruta: '/tipos-documentales', titulo: 'Tipos documentales', icono: 'tipos' },
    { ruta: '/ubicaciones', titulo: 'Ubicaciones', icono: 'ubicaciones' },
];
const administracion: Enlace[] = [
    { ruta: '/usuarios', titulo: 'Usuarios', icono: 'usuarios' },
    { ruta: '/roles', titulo: 'Roles', icono: 'roles' },
    { ruta: '/oficinas', titulo: 'Oficinas', icono: 'oficinas' },
    { ruta: '/siseve/administracion', titulo: 'Administrar SíseVe', icono: 'seguridad' },
];
/** Envuelve el layout privado con una única consulta de metadatos de acceso propio a SíseVe. */
export function AdminLayout() {
    return <AccesoSiseveProvider>
        <ContenidoAdminLayout />
    </AccesoSiseveProvider>;
}
/**
 * Presenta enlaces ya seleccionados por el layout y cierra el menú al navegar.
 * @param props - Grupo autorizado y callback de cierre del diálogo móvil.
 * @returns Enlaces con el mismo criterio de ruta activa, icono y título institucional.
 */
function GrupoEnlaces({ enlaces, cerrar }: {
    enlaces: Enlace[];
    cerrar: () => void;
}) {
    return enlaces.map(/** Presenta una ruta; SíseVe exige coincidencia exacta para no activar también su administración. */  enlace => (<NavLink key={enlace.ruta} to={enlace.ruta} end={enlace.ruta === '/siseve'} onClick={cerrar}>
        <Icono nombre={enlace.icono} />
        <span>
            {enlace.titulo}
        </span>
    </NavLink>));
}
/** Compone navegación y cuenta activa; delega el modal al hook y conserva los límites de error y carga por ruta. */
function ContenidoAdminLayout() {
    const auth = useAuth();
    const siseve = useAccesoSiseve();
    const location = useLocation();
    const { dialogo, abrir, cerrar } = useMenuMovil();
    const usuario = auth.sesion!.usuario;
    const enlaces = [
        ...gestion,
        ...(siseve.datos?.autorizado ? [{ ruta: '/siseve', titulo: 'SíseVe', icono: 'seguridad' as const }] : []),
    ];
    const titulo = [...administracion, ...enlaces].find(
        /** Identifica el módulo por la ruta exacta o una de sus páginas descendientes. */
        enlace => location.pathname === enlace.ruta || location.pathname.startsWith(enlace.ruta + '/'))?.titulo ?? 'Gestión documental';
    const marca = <div className={styles.marca}>
        <span className={styles.icono} aria-hidden="true">EP</span>
        <div>
            <strong>Gestión Documental</strong>
            <small>Enrique Paillardelle</small>
        </div>
    </div>;
    // Las condiciones del menú son presentación: cada endpoint revalida el acceso.
    const navegacion = <>
        <span className={styles.grupo}>Espacio de trabajo</span>
        <GrupoEnlaces enlaces={enlaces} cerrar={cerrar} />
        {usuario.rol === 'Administrador' && <>
            <span className={styles.grupo}>Administración</span>
            <GrupoEnlaces enlaces={administracion} cerrar={cerrar} />
        </>}
    </>;
    return <div className={styles.sistema}>
        <a className={styles.saltar} href="#contenido-principal">Saltar al contenido</a>
        <aside className={styles.sidebar}>
            {marca}
            <nav className={styles.menu} aria-label="Navegación principal">
                {navegacion}
            </nav>
            <div className={styles.pie}>
                <Icono nombre="seguridad" tamano={18} />
                <div>Archivo institucional<small>I.E. Enrique Paillardelle</small>
                </div>
            </div>
        </aside>
        <div className={styles.area}>
            <header className={styles.barra}>
                <div className={styles.contexto}>
                    <button type="button" className={styles.abrir} aria-label="Abrir navegación" aria-haspopup="dialog" onClick={abrir}>
                        <Icono nombre="menu" />
                    </button>
                    <div>
                        <span>Espacio institucional</span>
                        <strong>
                            {titulo}
                        </strong>
                    </div>
                </div>
                <div className={styles.cuenta}>
                    <span className={styles.avatar} aria-hidden="true">
                        {usuario.nombre.slice(0, 1)}
                        {usuario.apellido.slice(0, 1)}
                    </span>
                    <div>
                        <strong>
                            {usuario.nombre}
                        </strong>
                        <small>
                            {usuario.rol}
                        </small>
                    </div>
                    <button type="button" onClick={auth.cerrarSesion}>
                        <Icono nombre="salir" tamano={17} />
                        <span>Cerrar sesión</span>
                    </button>
                </div>
            </header>
            <div id="contenido-principal" tabIndex={-1} className={styles.contenido}>
                <ErrorRuta ruta={location.pathname}>
                    <Suspense fallback={<CargaRuta />}>
                        <Outlet />
                    </Suspense>
                </ErrorRuta>
            </div>
        </div>
        <dialog ref={dialogo} className={styles.drawer} aria-label="Menú de navegación">
            <div className={styles.cabeceraDrawer}>
                {marca}
                <button type="button" aria-label="Cerrar navegación" onClick={cerrar}>
                    <Icono nombre="cerrar" />
                </button>
            </div>
            <nav className={styles.menu} aria-label="Navegación móvil">
                {navegacion}
            </nav>
        </dialog>
    </div>;
}
