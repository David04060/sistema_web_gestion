import { Icono } from '../../../components/icons/Icono';
import { EstadoBadge } from '../../../components/ui/EstadoBadge';
import { useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Usuario } from '../../auth/schemas/auth.schema';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { consultarDashboard } from '../api/dashboard.api';
import type { Dashboard } from '../schemas/dashboard.schema';
import styles from '../styles/Dashboard.module.css';
import { etiquetasEstado } from '../../../lib/estados-documentales';
/**
 * Presenta la fecha del indicador según la configuración regional peruana, conservando el instante recibido.
 * @param valor - Valor recibido que debe validarse, transformar o presentar.
 */
const fecha = (valor: string) => new Date(valor).toLocaleString('es-PE');
/** Listas acotadas por SQL; no se agregan documentos ni se calculan totales en React. */
function Entradas({ entradas, vacio }: {
    entradas: Dashboard['recientes'];
    vacio: string;
}) {
    return entradas.length ? <ul className={styles.lista}>
        {entradas.map(/** Presenta una entrada autorizada con ruta, código, estado y fecha sin calcular agregados. */  e => <li key={e.ruta}>
            <Link to={e.ruta}>
                {e.codigo}
            </Link>
            <EstadoBadge estado={e.estado} />
            <small>
                {fecha(e.fecha)}
            </small>
        </li>)}
    </ul> : <p className={styles.vacio}>
        {vacio}
    </p>;
}
/** Panel con contrato validado y actualización al regresar, enfocar o solicitar recarga. */
export function DashboardPage({ usuario }: {
    usuario: Usuario;
}) {
    const { sesion } = useAuth();
    const token = sesion?.token ?? '';
    const consultar = useCallback(/** Consulta los indicadores autorizados con el JWT vigente. */() => consultarDashboard(token), [token]);
    const { datos, cargando, error, recargar } = useConsulta(consultar);
    useEffect(/** Registra la actualización del panel al recuperar foco o visibilidad. */() => {
        /**
         * Solicita indicadores actualizados al volver a una pestaña visible; el servidor vuelve a aplicar el alcance autorizado.
         */
        const enfocar = () => {
            if (document.visibilityState === 'visible')
                recargar();
        };
        window.addEventListener('focus', enfocar);
        document.addEventListener('visibilitychange', enfocar);
        return /** Retira los eventos de actualización del panel al desmontarlo. */ () => {
            window.removeEventListener('focus', enfocar);
            document.removeEventListener('visibilitychange', enfocar);
        };
    }, [recargar]);
    return <main className={styles.contenido}>
        <span className={styles.etiqueta}>Panel principal · Gestión documental</span>
        <div className={styles.cabecera}>
            <div>
                <h1>Bienvenido, {usuario.nombre}
                </h1>
                <p>
                    {usuario.rol} · {usuario.oficina ?? 'Sin oficina asignada'}
                </p>
            </div>
            <button type="button" onClick={recargar} disabled={cargando}>Actualizar panel</button>
        </div>
        {cargando && <p role="status">Consultando indicadores…</p>}
        {error && <div role="alert" className={styles.tarjeta}>
            <p>
                {error}
            </p>
            <button type="button" onClick={recargar}>Reintentar</button>
        </div>}
        {datos && <>
            <p className={styles.actualizado}>
                {datos.alcance === 'administrativo' ? 'Resumen de administración institucional.' : datos.alcance === 'institucional' ? 'Resumen institucional de documentos ordinarios.' : 'Resumen de documentos ordinarios según tus permisos.'} Actualizado: {fecha(datos.actualizado)}.</p>
            <section aria-label="Indicadores" className={styles.indicadores}>
                {datos.indicadores.map(/** Presenta el indicador y su total calculado por PostgreSQL. */  i => <article className={styles.indicador} key={i.clave}>
                    <div className={styles.iconoTarjeta}>
                        <Icono nombre={datos.alcance === 'administrativo' ? 'usuarios' : 'documentos'} tamano={16} />
                    </div>
                    <span>
                        {i.etiqueta}
                    </span>
                    <strong>
                        {i.total}
                    </strong>
                </article>)}
            </section>
            <section className={styles.tarjeta}>
                <h2>Accesos rápidos</h2>
                <nav aria-label="Accesos rápidos" className={styles.accesos}>
                    {datos.accesos.map(/** Presenta un acceso rápido incluido en la respuesta autorizada del backend. */  a => <Link key={a.ruta} to={a.ruta}>
                        <Icono nombre="tipos" tamano={18} />
                        {a.etiqueta}
                        <Icono nombre="flecha" tamano={16} />
                    </Link>)}
                </nav>
            </section>
            {datos.alcance !== 'administrativo' && <>
                <div className={styles.columnas}>
                    <section className={styles.tarjeta}>
                        <h2>Documentos por estado</h2>
                        <p>Incluye registros activos y anulados consultables. SíseVe se consulta en su módulo protegido.</p>
                        <dl className={styles.resumen}>
                            {datos.estados.map(/** Presenta el total del estado con su etiqueta institucional. */  i => <div key={i.clave}>
                                <dt>
                                    {etiquetasEstado[i.clave]}
                                </dt>
                                <dd>
                                    {i.total}
                                </dd>
                            </div>)}
                        </dl>
                    </section>
                    <section className={styles.tarjeta}>
                        <h2>Operaciones pendientes</h2>
                        <dl className={styles.resumen}>
                            {datos.operaciones.map(/** Presenta una operación pendiente con su total autorizado. */  i => <div key={i.clave}>
                                <dt>
                                    {i.etiqueta}
                                </dt>
                                <dd>
                                    {i.total}
                                </dd>
                            </div>)}
                        </dl>
                        <p>Las autorizaciones conservan el estado Pendiente de decisión hasta la salida física.</p>
                    </section>
                </div>
                <div className={styles.columnas}>
                    <section className={styles.tarjeta}>
                        <h2>Intervenciones disponibles</h2>
                        <p>Hasta 8 operaciones que requieren tu intervención. Abre el registro para realizar la acción.</p>
                        <Entradas entradas={datos.pendientes} vacio="No tienes operaciones pendientes de intervención." />
                    </section>
                    <section className={styles.tarjeta}>
                        <h2>Actividad documental reciente</h2>
                        <p>Última modificación de hasta 8 documentos cuyo contenido puedes consultar.</p>
                        <Entradas entradas={datos.recientes} vacio="No hay documentos autorizados para mostrar." />
                    </section>
                </div>
            </>}
        </>}
    </main>;
}
