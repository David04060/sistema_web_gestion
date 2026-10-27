import { EstadoBadge } from '../../../components/ui/EstadoBadge';
import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { fechaLocal } from '../../../lib/fechas';
import * as api from '../api/documentos.api';
import styles from '../../../components/ui/Admin.module.css';
/** Busca y pagina en el servidor: conteos y resultados quedan limitados por el mismo permiso SQL. */
export function DocumentosListaPage() {
    const token = useAuth().sesion!.token;
    const [params, setParams] = useSearchParams();
    const filtros = params.toString();
    const opciones = useConsulta(useCallback(/** Consulta las opciones y filtros documentales autorizados. */() => api.opciones(token), [token]));
    const consulta = useConsulta(useCallback(/** Consulta la página documental definida por los parámetros de la URL. */() => api.listar(token, filtros), [token, filtros]));
    /**
     * Cambia únicamente la página de la consulta en la URL, conservando los filtros actuales.
     * @param numero - Página solicitada manteniendo los filtros actuales.
     */
    function pagina(numero: number) {
        const siguiente = new URLSearchParams(params);
        siguiente.set('pagina', String(numero));
        setParams(siguiente);
    }
    return <main className={styles.pagina}>
        <div className={styles.titulo}>
            <div>
                <h1>Documentos</h1>
                {opciones.datos?.puede_registrar && <Link className={styles.boton} to="/documentos/nuevo">Registrar documento</Link>}
                <p>Registros físicos ordinarios dentro de tu acceso autorizado.</p>
            </div>
        </div>
        <section className={styles.tarjeta}>
            <form key={filtros} onSubmit={/** Convierte filtros no vacíos del formulario en parámetros de búsqueda y reinicia la paginación. */ e => {
                e.preventDefault();
                const datos = new FormData(e.currentTarget);
                const siguiente = new URLSearchParams();
                for (const [campo, valor] of datos)
                    if (String(valor).trim())
                        siguiente.set(campo, String(valor).trim());
                setParams(siguiente);
            }}>
                <div className={styles.datos}>
                    <div className={styles.campo}>
                        <label htmlFor="buscar-documento">Buscar por código, asunto o remitente</label>
                        <input id="buscar-documento" name="q" maxLength={250} defaultValue={params.get('q') ?? ''} />
                    </div>
                    <div className={styles.campo}>
                        <label htmlFor="tipo-filtro">Tipo documental</label>
                        <select id="tipo-filtro" name="tipo_documental_id" defaultValue={params.get('tipo_documental_id') ?? ''}>
                            <option value="">Todos</option>
                            {opciones.datos?.tipos.map(/** Presenta una opción de tipo documental para filtrar la consulta. */  t => <option key={t.id} value={t.id}>
                                {t.nombre}
                            </option>)}
                        </select>
                    </div>
                    <div className={styles.campo}>
                        <label htmlFor="estado-filtro">Circulacion</label>
                        <select id="estado-filtro" name="estado" defaultValue={params.get('estado') ?? ''}>
                            <option value="">Todos</option>
                            {['PENDIENTE_DECISION', 'EN_TRASLADO', 'RECIBIDO', 'RECHAZADO', 'CANCELADO'].map(/** Presenta uno de los cinco estados aprobados como filtro. */  e => <option key={e}>
                                {e}
                            </option>)}
                        </select>
                    </div>
                    {([{ campo: 'oficina_id', nombre: 'Oficina', id: 'oficina_id', etiqueta: 'oficina' }, { campo: 'responsable_id', nombre: 'Responsable', id: 'responsable_id', etiqueta: 'responsable' }, { campo: 'archivador_id', nombre: 'Ubicacion', id: 'archivador_id', etiqueta: 'ubicacion' }] as const).map(/** Compone un filtro de oficina, responsable o archivador desde opciones autorizadas. */  f => <div key={f.campo} className={styles.campo}>
                        <label htmlFor={f.campo}>
                            {f.nombre}
                        </label>
                        <select id={f.campo} name={f.campo} defaultValue={params.get(f.campo) ?? ''}>
                            <option value="">Todos</option>
                            {[...new Map(opciones.datos?.filtros.filter(/** Descarta las referencias vacías antes de construir opciones de filtro. */  v => v[f.id]).map(/** Indexa opciones por su ID para eliminar duplicados sin ampliar su alcance. */  v => [v[f.id], v])).values()].map(/** Presenta una opción única del filtro conservando su etiqueta autorizada. */  v => <option key={v[f.id]} value={v[f.id] ?? ''}>
                                {v[f.etiqueta]}
                            </option>)}
                        </select>
                    </div>)}
                    <div className={styles.campo}>
                        <label htmlFor="activo-documento">Estado del registro</label>
                        <select id="activo-documento" name="activo" defaultValue={params.get('activo') ?? ''}>
                            <option value="">Todos los autorizados</option>
                            <option value="true">Vigente</option>
                            <option value="false">Anulado</option>
                        </select>
                    </div>
                </div>
                <div className={styles.acciones}>
                    <button className={styles.boton}>Buscar</button>
                    <button type="button" className={styles.secundario} onClick={/** Limpia los filtros de la URL y consulta nuevamente la primera página. */() => setParams({})}>Limpiar filtros</button>
                </div>
            </form>
        </section>
        <EstadoCarga {...consulta} reintentar={consulta.recargar} />
        {consulta.datos && <section className={styles.tarjeta}>
            <div className={styles.tabla}>
                <table>
                    <thead>
                        <tr>
                            <th>Código</th>
                            <th>Asunto</th>
                            <th>Tipo</th>
                            <th>Responsable / oficina</th>
                            <th>Circulación</th>
                            <th>Registro</th>
                        </tr>
                    </thead>
                    <tbody>
                        {consulta.datos.documentos.map(/** Presenta un documento devuelto por la página autorizada del backend. */  d => <tr key={d.id}>
                            <td>
                                <Link to={`/documentos/${d.id}`}>
                                    {d.codigo}
                                </Link>
                            </td>
                            <td>
                                {d.asunto}
                            </td>
                            <td>
                                {d.tipo_documental}
                            </td>
                            <td>
                                {d.responsable}
                                <br />
                                {d.oficina}
                            </td>
                            <td>
                                <EstadoBadge estado={d.estado_tramite} />
                                <br />
                                {!d.activo && 'Anulado'}
                            </td>
                            <td>
                                {fechaLocal(d.fecha_creacion)}
                            </td>
                        </tr>)}
                    </tbody>
                </table>
            </div>
            {!consulta.datos.documentos.length && <p className={styles.vacio}>No hay documentos que coincidan dentro de tu acceso.</p>}
            <div className={styles.paginacion}>
                <p>
                    {consulta.datos.total} registros · Página {consulta.datos.pagina}
                </p>
                <div className={styles.acciones}>
                    <button className={styles.secundario} disabled={consulta.datos.pagina <= 1} onClick={/** Solicita la página anterior conservando los filtros. */() => pagina(consulta.datos!.pagina - 1)}>Anterior</button>
                    <button className={styles.secundario} disabled={consulta.datos.pagina * consulta.datos.limite >= consulta.datos.total} onClick={/** Solicita la página siguiente conservando los filtros. */() => pagina(consulta.datos!.pagina + 1)}>Siguiente</button>
                </div>
            </div>
        </section>}
    </main>;
}
