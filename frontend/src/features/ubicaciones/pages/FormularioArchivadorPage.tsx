import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { useEstantesDisponibles } from '../hooks/useUbicaciones';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { ArchivadorForm } from '../components/UbicacionForms';
import * as api from '../api/ubicaciones.api';
import styles from '../../../components/ui/Admin.module.css';
/**
 * Carga exclusivamente estantes disponibles y el archivador solicitado; conserva su padre y delega el guardado con permisos vigentes en el servidor.
 */
export function FormularioArchivadorPage() {
    const { id } = useParams();
    const auth = useAuth();
    const token = auth.sesion!.token;
    const navigate = useNavigate();
    const q = useEstantesDisponibles();
    const detalle = useConsulta(useCallback(/** Consulta el archivador al editar; evita una petición de detalle en creación. */() => id ? api.archivador(token, id) : Promise.resolve(null), [id, token]));
    const e = detalle.datos?.archivador;
    const autorizado = !e || auth.sesion!.usuario.rol === 'Administrador' || e.usuario_id === auth.sesion!.usuario.id;
    return <main className={styles.pagina}>
        <h1>
            {id ? 'Editar archivador' : 'Registrar archivador'}
        </h1>
        <EstadoCarga cargando={q.cargando || detalle.cargando} error={q.error || detalle.error} reintentar={/** Reintenta el catálogo de estantes y el detalle del archivador. */() => {
            q.recargar();
            detalle.recargar();
        }} />
        {!q.cargando && !detalle.cargando && !q.error && !detalle.error && q.datos && (autorizado ? <section className={styles.tarjeta}>
            <ArchivadorForm inicial={e} estantes={q.datos.estantes.filter(/** Ofrece todos los estantes al administrador o solo los propios a las otras cuentas. */  s => auth.sesion!.usuario.rol === 'Administrador' || s.usuario_id === auth.sesion!.usuario.id)} onGuardar={/** Guarda el archivador validado y navega al detalle confirmado por el backend. */async (d) => {
                const r = await api.guardarArchivador(token, d, id);
                navigate(`/ubicaciones/archivadores/${r.archivador.id}`, { replace: true });
            }} />
        </section> : <p role="alert">Solo puedes consultar esta ubicación.</p>)}
    </main>;
}
