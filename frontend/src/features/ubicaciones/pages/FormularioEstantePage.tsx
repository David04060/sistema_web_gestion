import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { useOpcionesUbicaciones } from '../hooks/useUbicaciones';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { EstanteForm } from '../components/UbicacionForms';
import * as api from '../api/ubicaciones.api';
import styles from '../../../components/ui/Admin.module.css';
/**
 * Carga las opciones de asignación y, al editar, el estante; conserva la autorización visual existente y delega la escritura validada.
 */
export function FormularioEstantePage() {
    const { id } = useParams();
    const auth = useAuth();
    const token = auth.sesion!.token;
    const navigate = useNavigate();
    const q = useOpcionesUbicaciones();
    const detalle = useConsulta(useCallback(/** Consulta el estante cuando se edita; evita una petición de detalle durante la creación. */() => id ? api.estante(token, id) : Promise.resolve(null), [id, token]));
    const e = detalle.datos?.estante;
    const autorizado = !e || auth.sesion!.usuario.rol === 'Administrador' || e.usuario_id === auth.sesion!.usuario.id;
    return <main className={styles.pagina}>
        <h1>
            {id ? 'Editar estante' : 'Registrar estante'}
        </h1>
        <EstadoCarga cargando={q.cargando || detalle.cargando} error={q.error || detalle.error} reintentar={/** Reintenta tanto las opciones como el detalle para reconstruir el formulario. */() => {
            q.recargar();
            detalle.recargar();
        }} />
        {!q.cargando && !detalle.cargando && !q.error && !detalle.error && q.datos && (autorizado ? <section className={styles.tarjeta}>
            <EstanteForm inicial={e} opciones={q.datos} onGuardar={/** Guarda el estante validado y navega al ID confirmado por el backend. */async (d) => {
                const r = await api.guardarEstante(token, d, id);
                navigate(`/ubicaciones/estantes/${r.estante.id}`, { replace: true });
            }} />
        </section> : <p role="alert">Solo puedes consultar esta ubicación.</p>)}
    </main>;
}
