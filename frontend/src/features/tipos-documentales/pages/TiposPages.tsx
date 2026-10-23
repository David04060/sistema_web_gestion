import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { TipoForm } from '../components/TipoForm';
import * as api from '../api/tipos.api';
import { fechaLocal } from '../../../lib/fechas';
import styles from '../../../components/ui/Admin.module.css';
/** Catálogo institucional visible para cuentas autenticadas, sin acceso documental implícito. */
export function ListaTiposPage() {
    const auth = useAuth();
    const token = auth.sesion!.token;
    const admin = auth.sesion!.usuario.rol === 'Administrador';
    const q = useConsulta(useCallback(/** Consulta el catálogo real de tipos documentales. */() => api.listar(token), [token]));
    const [busqueda, setBusqueda] = useState('');
    const filas = q.datos?.tipos.filter(/** Filtra localmente el catálogo ya autorizado por nombre o prefijo, sin consultar documentos. */  t => `${t.nombre} ${t.prefijo_codigo ?? ''}`.toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es')));
    return <main className={styles.pagina}>
        <div className={styles.titulo}>
            <div>
                <h1>Tipos documentales</h1>
                <p>Catálogo institucional compartido. Consultarlo no otorga acceso a documentos.</p>
            </div>
            {admin && <Link className={styles.boton} to="/tipos-documentales/nuevo">Registrar tipo</Link>}
        </div>
        <section className={styles.tarjeta}>
            <div className={styles.campo}>
                <label htmlFor="buscar-tipo">Buscar por nombre o prefijo</label>
                <input id="buscar-tipo" value={busqueda} onChange={/** Actualiza el texto de búsqueda del catálogo. */ e => setBusqueda(e.target.value)} />
            </div>
            <EstadoCarga {...q} reintentar={q.recargar} />
            {filas && <div className={styles.tabla}>
                <table>
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Prefijo</th>
                            <th>Protección</th>
                            <th>Acción</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filas.map(/** Presenta el tipo, su prefijo y su condición de reserva sin revelar contenido documental. */  t => <tr key={t.id}>
                            <td>
                                {t.nombre}
                            </td>
                            <td>
                                {t.prefijo_codigo ?? 'Sin prefijo'}
                            </td>
                            <td>
                                {t.requiere_clave ? 'Reservado' : t.prefijo_protegido ? 'Prefijo histórico' : 'Catálogo'}
                            </td>
                            <td>
                                <Link to={`/tipos-documentales/${t.id}`}>Consultar</Link>
                            </td>
                        </tr>)}
                    </tbody>
                </table>
                {!filas.length && <p className={styles.vacio}>No hay tipos que coincidan.</p>}
            </div>}
        </section>
    </main>;
}
/**
 * Consulta el tipo documental y muestra sus restricciones de edición según el rol y las reservas institucionales.
 */
export function DetalleTipoPage() {
    const { id = '' } = useParams();
    const auth = useAuth();
    const token = auth.sesion!.token;
    const q = useConsulta(useCallback(/** Consulta el detalle del tipo indicado en la ruta. */() => api.detalle(token, id), [token, id]));
    const t = q.datos?.tipo;
    return <main className={styles.pagina}>
        <h1>Tipo documental</h1>
        <EstadoCarga {...q} reintentar={q.recargar} />
        {t && <section className={styles.tarjeta}>
            <h2>
                {t.nombre}
            </h2>
            <dl className={styles.datos}>
                <div>
                    <dt>Prefijo</dt>
                    <dd>
                        {t.prefijo_codigo ?? 'Sin prefijo ordinario'}
                    </dd>
                </div>
                <div>
                    <dt>Protección histórica</dt>
                    <dd>
                        {t.prefijo_protegido ? 'Prefijo bloqueado' : 'Sin códigos generados'}
                    </dd>
                </div>
                <div>
                    <dt>Creación</dt>
                    <dd>
                        {fechaLocal(t.fecha_creacion)}
                    </dd>
                </div>
                <div>
                    <dt>Modificación</dt>
                    <dd>
                        {fechaLocal(t.fecha_modificacion)}
                    </dd>
                </div>
            </dl>
            <p>
                {t.requiere_clave ? 'Categoría restringida y reservada. Este módulo no concede autorizaciones.' : 'Tipo del catálogo institucional.'}
            </p>
            <div className={styles.acciones}>
                {auth.sesion!.usuario.rol === 'Administrador' && <Link className={styles.boton} to={`/tipos-documentales/${id}/editar`}>Revisar / editar</Link>}
                <Link className={styles.secundario} to="/tipos-documentales">Volver</Link>
            </div>
        </section>}
    </main>;
}
/**
 * Carga el tipo existente cuando hay ID y delega el formulario validado; navega al detalle después de guardar.
 */
export function FormularioTipoPage() {
    const { id } = useParams();
    const token = useAuth().sesion!.token;
    const navigate = useNavigate();
    const q = useConsulta(useCallback(/** Consulta el tipo al editar; en creación evita una solicitud de detalle. */() => id ? api.detalle(token, id) : Promise.resolve(null), [token, id]));
    return <main className={styles.pagina}>
        <h1>
            {id ? 'Editar tipo documental' : 'Registrar tipo documental'}
        </h1>
        <EstadoCarga {...q} reintentar={q.recargar} />
        {!q.cargando && !q.error && <section className={styles.tarjeta}>
            <TipoForm key={id ?? 'nuevo'} inicial={q.datos?.tipo} onGuardar={/** Guarda el tipo y navega al detalle confirmado por el servidor. */async (datos) => {
                const r = await api.guardar(token, datos, id);
                navigate(`/tipos-documentales/${r.tipo.id}`, { replace: true });
            }} />
        </section>}
    </main>;
}
