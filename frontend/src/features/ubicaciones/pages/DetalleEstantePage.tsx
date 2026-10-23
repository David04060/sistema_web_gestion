import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import * as api from '../api/ubicaciones.api';
import { fechaLocal } from '../../../lib/fechas';
import styles from '../../../components/ui/Admin.module.css';
/**
 * Consulta un estante y sus archivadores autorizados; muestra edición al administrador o al responsable de esa ubicación.
 */
export function DetalleEstantePage() {
    const { id = '' } = useParams();
    const auth = useAuth();
    const token = auth.sesion!.token;
    const q = useConsulta(useCallback(/** Consulta el estante autorizado seleccionado por la ruta. */() => api.estante(token, id), [token, id]));
    const e = q.datos?.estante;
    const edita = e && (auth.sesion!.usuario.rol === 'Administrador' || e.usuario_id === auth.sesion!.usuario.id);
    return <main className={styles.pagina}>
        <h1>Estante</h1>
        <EstadoCarga {...q} reintentar={q.recargar} />
        {e && <section className={styles.tarjeta}>
            <h2>
                {e.codigo}
            </h2>
            <dl className={styles.datos}>
                <div>
                    <dt>Oficina</dt>
                    <dd>
                        {e.oficina}
                    </dd>
                </div>
                <div>
                    <dt>Responsable</dt>
                    <dd>
                        {e.responsable}
                        {!e.responsable_activo ? ' (inactivo)' : ''}
                    </dd>
                </div>
                <div>
                    <dt>Creación</dt>
                    <dd>
                        {fechaLocal(e.fecha_creacion)}
                    </dd>
                </div>
                <div>
                    <dt>Modificación</dt>
                    <dd>
                        {fechaLocal(e.fecha_modificacion)}
                    </dd>
                </div>
            </dl>
            <h2>Archivadores</h2>
            {q.datos?.archivadores.map(/** Enlaza cada archivador autorizado perteneciente al estante consultado. */  ar => <p key={ar.id}>
                <Link to={`/ubicaciones/archivadores/${ar.id}`}>Archivador {ar.numero}
                </Link>
            </p>)}
            {!q.datos?.archivadores.length && <p>No hay archivadores registrados.</p>}
            <div className={styles.acciones}>
                {edita && <Link className={styles.boton} to={`/ubicaciones/estantes/${id}/editar`}>Editar estante</Link>}
                <Link className={styles.secundario} to="/ubicaciones">Volver</Link>
            </div>
        </section>}
    </main>;
}
