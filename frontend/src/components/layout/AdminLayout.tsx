/** Archivo: Compone menú, cuenta y contenido de la página para escritorio y móvil.
 */
import { Suspense } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth/hooks/useAuth';
import { useMenuMovil } from '../../hooks/useMenuMovil';
import { Icono, type IconName } from '../icons/Icono';
import { ErrorRuta } from '../ui/ErrorRuta';
import { CargaRuta } from '../ui/CargaRuta';
import styles from './AdminLayout.module.css';
import { enlacesPerfil } from '../../lib/perfiles';
import logo from '../../assets/logo-institucion.jpg';
import { SelectorTema } from '../ui/SelectorTema';
interface Enlace {
  ruta: string;
  titulo: string;
  icono: IconName;
}
/**
 * Presenta enlaces ya seleccionados por el layout y cierra el menú al navegar.
 * @param props - Grupo autorizado y callback de cierre del diálogo móvil.
 * @returns Enlaces con el mismo criterio de ruta activa, icono y título institucional.
 */
function GrupoEnlaces({ enlaces, cerrar }: { enlaces: Enlace[]; cerrar: () => void }) {
  return enlaces.map((enlace) => (
    <NavLink key={enlace.ruta} to={enlace.ruta} end={enlace.ruta === '/dashboard'} onClick={cerrar}>
      <Icono nombre={enlace.icono} />
      <span>{enlace.titulo}</span>
    </NavLink>
  ));
}
/**
 * Compone navegación y cuenta activa; delega el modal al hook y conserva los límites de error y
 * carga por ruta.
 */
/** Compone la navegación del perfil actual; el servidor sigue decidiendo el acceso a cada dato. */
export function AdminLayout() {
  const auth = useAuth();
  const location = useLocation();
  const { dialogo, abrir, cerrar } = useMenuMovil();
  const usuario = auth.sesion!.usuario;
  const enlaces = enlacesPerfil(usuario.rol, usuario.oficina_id);
  const titulo =
    enlaces.find((e) => location.pathname === e.ruta || location.pathname.startsWith(e.ruta + '/'))?.titulo ??
    'Gestión documental';
  const marca = (
    <div className={styles.marca}>
      <img
        className={styles.icono}
        src={logo}
        alt="Escudo de la I.E. Enrique Paillardelle"
        width="48"
        height="48"
      />
      <div>
        <strong>Gestión Documental</strong>
        <small>Enrique Paillardelle</small>
      </div>
    </div>
  );
  // Las condiciones del menú son presentación: cada endpoint revalida el acceso.
  const navegacion = (
    <>
      <span className={styles.grupo}>Espacio de trabajo</span>
      <GrupoEnlaces enlaces={enlaces} cerrar={cerrar} />
    </>
  );
  return (
    <div className={styles.sistema}>
      <a className={styles.saltar} href="#contenido-principal">
        Saltar al contenido
      </a>
      <aside className={styles.sidebar}>
        {marca}
        <nav className={styles.menu} aria-label="Navegación principal">
          {navegacion}
        </nav>
        <div className={styles.pie}>
          <Icono nombre="seguridad" tamano={18} />
          <div>
            Archivo institucional<small>I.E. Enrique Paillardelle</small>
          </div>
        </div>
      </aside>
      <div className={styles.area}>
        <header className={styles.barra}>
          <div className={styles.contexto}>
            <button
              type="button"
              className={styles.abrir}
              aria-label="Abrir navegación"
              aria-haspopup="dialog"
              onClick={abrir}
            >
              <Icono nombre="menu" />
            </button>
            <div>
              <span>Espacio institucional</span>
              <strong>{titulo}</strong>
            </div>
          </div>
          <div className={styles.cuenta}>
            <SelectorTema />
            <span className={styles.avatar} aria-hidden="true">
              {usuario.nombre.slice(0, 1)}
              {usuario.apellido.slice(0, 1)}
            </span>
            <div>
              <strong>{usuario.nombre}</strong>
              <small>{usuario.rol}</small>
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
    </div>
  );
}
