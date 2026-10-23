import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import * as api from '../api/ubicaciones.api';
import { fechaLocal } from '../../../lib/fechas';
import styles from '../../../components/ui/Admin.module.css';
/**
 * Consulta el archivador autorizado y enlaza su estante; la interfaz permite editar solo al administrador o responsable.
 */
export function DetalleArchivadorPage() {
    const { id = '' } = useParams();
    const auth = useAuth();
    const token = auth.sesion!.token;
    const q = useConsulta(useCallback(/** Consulta el archivador autorizado seleccionado por la ruta. */() => api.archivador(token, id), [token, id]));
    const e = q.datos?.archivador;
    const edita = e && (auth.sesion!.usuario.rol === 'Administrador' || e.usuario_id === auth.sesion!.usuario.id);
    return <main className={styles.pagina}>
        <h1>Archivador</h1>
        <EstadoCarga {...q} reintentar={q.recargar} />
        {e && <section className={styles.tarjeta}>
            <h2>Archivador {e.numero}
            </h2>
            <dl className={styles.datos}>
                <div>
                    <dt>Oficina</dt>
                    <dd>
                        {e.oficina}
                    </dd>
                </div>
                <div>
                    <dt>Estante</dt>
                    <dd>
                        <Link to={`/ubicaciones/estantes/${e.estante_id}`}>
                            {e.codigo}
                        </Link>
                    </dd>
                </div>
                <div>
                    <dt>Responsable</dt>
                    <dd>
                        {e.responsable}
                    </dd>
                </div>
                <div>
                    <dt>Modificación</dt>
                    <dd>
                        {fechaLocal(e.fecha_modificacion)}
                    </dd>
                </div>
            </dl>
            <p>La edición conserva el estante y todas las referencias existentes.</p>
            <div className={styles.acciones}>
                {edita && <Link className={styles.boton} to={`/ubicaciones/archivadores/${id}/editar`}>Editar archivador</Link>}
                <Link className={styles.secundario} to="/ubicaciones">Volver</Link>
            </div>
        </section>}
    </main>;
}
