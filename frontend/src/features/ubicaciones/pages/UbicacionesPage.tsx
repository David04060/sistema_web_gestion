import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUbicaciones } from '../hooks/useUbicaciones';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import styles from '../../../components/ui/Admin.module.css';
/** Muestra exclusivamente filas autorizadas por SQL. Dirección puede consultar sin editar las ajenas. */
export function UbicacionesPage() {
    const q = useUbicaciones();
    const [busqueda, setBusqueda] = useState('');
    const texto = busqueda.trim().toLocaleLowerCase('es');
    const es = q.datos?.estantes.filter(/** Filtra estantes ya autorizados por código, oficina o responsable. */  e => `${e.codigo} ${e.oficina} ${e.responsable}`.toLocaleLowerCase('es').includes(texto));
    const ar = q.datos?.archivadores.filter(/** Filtra archivadores ya autorizados por número, estante, oficina o responsable. */  e => `${e.numero} ${e.codigo} ${e.oficina} ${e.responsable}`.toLocaleLowerCase('es').includes(texto));
    return <main className={styles.pagina}>
        <div className={styles.titulo}>
            <div>
                <h1>Ubicaciones físicas</h1>
                <p>Oficina → Estante → Archivador. Responsabilidad e identificación institucional.</p>
            </div>
            <div className={styles.acciones}>
                <Link className={styles.boton} to="/ubicaciones/estantes/nuevo">Registrar estante</Link>
                <Link className={styles.secundario} to="/ubicaciones/archivadores/nuevo">Registrar archivador</Link>
            </div>
        </div>
        <EstadoCarga {...q} reintentar={q.recargar} />
        {q.datos && <>
            <section className={styles.tarjeta}>
                <div className={styles.campo}>
                    <label htmlFor="buscar-ubicacion">Buscar por oficina, responsable o identificación</label>
                    <input id="buscar-ubicacion" value={busqueda} onChange={/** Actualiza el texto de búsqueda local de ubicaciones. */ e => setBusqueda(e.target.value)} />
                </div>
                <h2>Estantes</h2>
                <div className={styles.tabla}>
                    <table>
                        <thead>
                            <tr>
                                <th>Oficina</th>
                                <th>Código</th>
                                <th>Responsable</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {es?.map(/** Presenta un estante autorizado y señala si su responsable histórico está inactivo. */  e => <tr key={e.id}>
                                <td>
                                    {e.oficina}
                                </td>
                                <td>
                                    {e.codigo}
                                </td>
                                <td>
                                    {e.responsable}
                                    {!e.responsable_activo ? ' (inactivo)' : ''}
                                </td>
                                <td>
                                    <Link to={`/ubicaciones/estantes/${e.id}`}>Consultar</Link>
                                </td>
                            </tr>)}
                        </tbody>
                    </table>
                    {!es?.length && <p className={styles.vacio}>No hay estantes que coincidan dentro de tu acceso.</p>}
                </div>
            </section>
            <section className={styles.tarjeta}>
                <h2>Archivadores</h2>
                <div className={styles.tabla}>
                    <table>
                        <thead>
                            <tr>
                                <th>Oficina</th>
                                <th>Estante</th>
                                <th>Número</th>
                                <th>Responsable</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ar?.map(/** Presenta un archivador autorizado con referencia a su estante. */  e => <tr key={e.id}>
                                <td>
                                    {e.oficina}
                                </td>
                                <td>
                                    {e.codigo}
                                </td>
                                <td>
                                    {e.numero}
                                </td>
                                <td>
                                    {e.responsable}
                                </td>
                                <td>
                                    <Link to={`/ubicaciones/archivadores/${e.id}`}>Consultar</Link>
                                </td>
                            </tr>)}
                        </tbody>
                    </table>
                    {!ar?.length && <p className={styles.vacio}>No hay archivadores que coincidan dentro de tu acceso.</p>}
                </div>
            </section>
        </>}
    </main>;
}
