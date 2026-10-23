import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { useCatalogosUsuarios } from '../hooks/useCatalogosUsuarios';
import { listar } from '../api/usuarios.api';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import styles from '../../../components/ui/Admin.module.css';
/** Búsqueda y filtros quedan en la URL, con paginación de servidor y total de la misma consulta SQL. */
export function UsuariosListaPage() {
    const [params, setParams] = useSearchParams();
    const filtros = params.toString();
    const token = useAuth().sesion!.token;
    const consultar = useCallback(/** Consulta la página administrativa definida por los parámetros de la URL. */() => listar(token, filtros), [token, filtros]);
    const consulta = useConsulta(consultar);
    const catalogos = useCatalogosUsuarios();
    /**
     * Actualiza la página en la URL sin eliminar los filtros del listado administrativo.
     * @param numero - Página solicitada manteniendo los filtros actuales.
     */
    function pagina(numero: number) {
        const nuevos = new URLSearchParams(params);
        nuevos.set('pagina', String(numero));
        setParams(nuevos);
    }
    return <main className={styles.pagina}>
        <div className={styles.titulo}>
            <div>
                <h1>Usuarios</h1>
                <p>Cuentas, asignaciones y acceso al sistema institucional.</p>
            </div>
            <Link className={styles.boton} to="/usuarios/nuevo">Crear cuenta</Link>
        </div>
        <section className={styles.tarjeta} aria-label="Buscar y filtrar usuarios">
            <EstadoCarga cargando={catalogos.cargando} error={catalogos.error} reintentar={catalogos.recargar} />
            {catalogos.datos && <form key={filtros} onSubmit={/** Construye filtros no vacíos desde el formulario y reinicia la paginación. */ evento => {
                evento.preventDefault();
                const form = new FormData(evento.currentTarget);
                const nuevos = new URLSearchParams();
                for (const [clave, valor] of form)
                    if (String(valor).trim())
                        nuevos.set(clave, String(valor).trim());
                setParams(nuevos);
            }}>
                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className={styles.campo}>
                        <label htmlFor="buscar-usuario">Buscar</label>
                        <input id="buscar-usuario" name="q" placeholder="Nombre, usuario o correo" maxLength={254} defaultValue={params.get('q') ?? ''} />
                    </div>
                    <div className={styles.campo}>
                        <label htmlFor="filtrar-rol">Rol</label>
                        <select id="filtrar-rol" name="rol_id" defaultValue={params.get('rol_id') ?? ''}>
                            <option value="">Todos</option>
                            {catalogos.datos.roles.map(/** Presenta un rol real como filtro de cuentas. */  rol => <option key={rol.id} value={rol.id}>
                                {rol.nombre}
                            </option>)}
                        </select>
                    </div>
                    <div className={styles.campo}>
                        <label htmlFor="filtrar-oficina">Oficina</label>
                        <select id="filtrar-oficina" name="oficina_id" defaultValue={params.get('oficina_id') ?? ''}>
                            <option value="">Todas</option>
                            {catalogos.datos.oficinas.map(/** Presenta una oficina real como filtro de cuentas. */  oficina => <option key={oficina.id} value={oficina.id}>
                                {oficina.nombre}
                            </option>)}
                        </select>
                    </div>
                    <div className={styles.campo}>
                        <label htmlFor="filtrar-estado">Estado</label>
                        <select id="filtrar-estado" name="activo" defaultValue={params.get('activo') ?? ''}>
                            <option value="">Todos</option>
                            <option value="true">Activo</option>
                            <option value="false">Inactivo</option>
                        </select>
                    </div>
                </div>
                <div className={styles.acciones}>
                    <button className={styles.boton}>Buscar</button>
                    <Link className={styles.secundario} to="/usuarios">Limpiar filtros</Link>
                </div>
            </form>}
        </section>
        <section className={styles.tarjeta}>
            <EstadoCarga cargando={consulta.cargando} error={consulta.error} reintentar={consulta.recargar} />
            {consulta.datos && <>
                {consulta.datos.usuarios.length ? <div className={styles.tabla}>
                    <table>
                        <caption className="sr-only">Cuentas registradas</caption>
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Usuario</th>
                                <th>Rol</th>
                                <th>Oficina</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {consulta.datos.usuarios.map(/** Presenta una cuenta de la página autorizada sin hashes ni versión de autenticación. */  usuario => <tr key={usuario.id}>
                                <td>
                                    <Link to={`/usuarios/${usuario.id}`}>
                                        {usuario.nombre} {usuario.apellido}
                                    </Link>
                                </td>
                                <td>
                                    {usuario.nombre_usuario}
                                </td>
                                <td>
                                    {usuario.rol}
                                </td>
                                <td>
                                    {usuario.oficina ?? 'Sin asignar'}
                                </td>
                                <td>
                                    <span className={`${styles.estado} ${!usuario.activo ? styles.inactivo : ''}`}>
                                        {usuario.activo ? 'Activo' : 'Inactivo'}
                                    </span>
                                </td>
                                <td>
                                    <Link to={`/usuarios/${usuario.id}`}>Consultar</Link>
                                </td>
                            </tr>)}
                        </tbody>
                    </table>
                </div> : <p className={styles.vacio}>No hay cuentas que coincidan con los filtros.</p>}
                <div className={styles.paginacion}>
                    <span>
                        {consulta.datos.total} cuentas · Página {consulta.datos.pagina}
                    </span>
                    <div className={styles.acciones}>
                        <button className={styles.secundario} disabled={consulta.datos.pagina <= 1} onClick={/** Solicita la página anterior conservando los filtros administrativos. */() => pagina(consulta.datos!.pagina - 1)}>Anterior</button>
                        <button className={styles.secundario} disabled={consulta.datos.pagina * consulta.datos.limite >= consulta.datos.total} onClick={/** Solicita la página siguiente conservando los filtros administrativos. */() => pagina(consulta.datos!.pagina + 1)}>Siguiente</button>
                    </div>
                </div>
            </>}
        </section>
    </main>;
}
