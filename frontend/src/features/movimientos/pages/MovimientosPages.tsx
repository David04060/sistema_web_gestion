import { EstadoBadge } from '../../../components/ui/EstadoBadge';
import { MovimientoAcciones } from '../components/MovimientoAcciones';
import { useCallback, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { fechaLocal } from '../../../lib/fechas';
import * as api from '../api/movimientos.api';
import styles from '../../../components/ui/Admin.module.css';
/** Consulta el recorrido autorizado; participar en él no concede edición ni acceso a todo el contenido. */
export function MovimientosListaPage() {
    const token = useAuth().sesion!.token;
    const [params, setParams] = useSearchParams();
    const filtros = params.toString();
    const consulta = useConsulta(useCallback(/** Consulta la bandeja de movimientos definida por la URL. */() => api.listar(token, filtros), [token, filtros]));
    /**
     * Cambia la página de la bandeja conservando sus filtros en la URL.
     * @param n - Número de página solicitado.
     */
    function pagina(n: number) {
        const p = new URLSearchParams(params);
        p.set('pagina', String(n));
        setParams(p);
    }
    return <main className={styles.pagina}>
        <div className={styles.titulo}>
            <div>
                <h1>Movimientos documentales</h1>
                <p>Recorrido de los originales dentro de tu acceso institucional.</p>
            </div>
            <Link className={styles.secundario} to="/documentos">Consultar documentos</Link>
        </div>
        <section className={styles.tarjeta}>
            <div className={styles.datos}>
                <div className={styles.campo}>
                    <label htmlFor="bandeja-mov">Bandeja de operaciones</label>
                    <select id="bandeja-mov" value={params.get('bandeja') ?? ''} onChange={/** Cambia la bandeja seleccionada y reinicia su paginación. */ e => {
                        const p = new URLSearchParams(params);
                        if (e.target.value)
                            p.set('bandeja', e.target.value);
                        else
                            p.delete('bandeja');
                        p.delete('pagina');
                        setParams(p);
                    }}>
                        <option value="">Recorrido autorizado completo</option>
                        <option value="entrada">Recepciones pendientes para mi</option>
                        <option value="salida">Mis originales en traslado</option>
                        <option value="recuperacion">Debo confirmar recuperacion</option>
                    </select>
                </div>
                <div className={styles.campo}>
                    <label htmlFor="filtro-mov">Estado del movimiento</label>
                    <select id="filtro-mov" value={params.get('estado') ?? ''} onChange={/** Cambia el estado de filtro y reinicia la paginación de movimientos. */ e => {
                        const p = new URLSearchParams(params);
                        if (e.target.value)
                            p.set('estado', e.target.value);
                        else
                            p.delete('estado');
                        p.delete('pagina');
                        setParams(p);
                    }}>
                        <option value="">Todos</option>
                        {['EN_TRASLADO', 'RECIBIDO', 'RECHAZADO', 'CANCELADO'].map(/** Presenta un estado de movimiento aprobado como filtro. */  e => <option key={e}>
                            {e}
                        </option>)}
                    </select>
                </div>
            </div>
            <p>
                <Link to="/documentos?estado=PENDIENTE_DECISION">Documentos pendientes de decision o salida autorizada</Link>
            </p>
        </section>
        <EstadoCarga {...consulta} reintentar={consulta.recargar} />
        {consulta.datos && <section className={styles.tarjeta}>
            <div className={styles.tabla}>
                <table>
                    <thead>
                        <tr>
                            <th>Documento</th>
                            <th>Origen</th>
                            <th>Destino</th>
                            <th>Estado</th>
                            <th>Registro</th>
                            <th>Acción</th>
                        </tr>
                    </thead>
                    <tbody>
                        {consulta.datos.movimientos.map(/** Presenta origen, destino y estado del movimiento sin revelar contenido documental. */  m => <tr key={m.id}>
                            <td>
                                {m.codigo}
                            </td>
                            <td>
                                {m.usuario_origen}
                                <br />
                                {m.oficina_origen}
                            </td>
                            <td>
                                {m.usuario_destino}
                                <br />
                                {m.oficina_destino}
                            </td>
                            <td>
                                <EstadoBadge estado={m.estado} />
                            </td>
                            <td>
                                {fechaLocal(m.fecha_creacion)}
                            </td>
                            <td>
                                <Link to={`/movimientos/${m.id}`}>Consultar</Link>
                            </td>
                        </tr>)}
                    </tbody>
                </table>
            </div>
            {!consulta.datos.movimientos.length && <p className={styles.vacio}>No hay movimientos autorizados para esta consulta.</p>}
            <div className={styles.paginacion}>
                <p>
                    {consulta.datos.total} movimientos · Página {consulta.datos.pagina}
                </p>
                <div className={styles.acciones}>
                    <button className={styles.secundario} disabled={consulta.datos.pagina <= 1} onClick={/** Solicita la página anterior de la bandeja. */() => pagina(consulta.datos!.pagina - 1)}>Anterior</button>
                    <button className={styles.secundario} disabled={consulta.datos.pagina * consulta.datos.limite >= consulta.datos.total} onClick={/** Solicita la página siguiente de la bandeja. */() => pagina(consulta.datos!.pagina + 1)}>Siguiente</button>
                </div>
            </div>
        </section>}
    </main>;
}
/**
 * Consulta un movimiento autorizado y muestra sus hitos físicos; conserva la confirmación de una acción durante la recarga del detalle.
 */
export function MovimientoDetallePage() {
    const { id = '' } = useParams();
    const token = useAuth().sesion!.token;
    const consulta = useConsulta(useCallback(/** Consulta el movimiento seleccionado con el JWT actual. */() => api.detalle(token, id), [token, id]));
    // Se conserva aun cuando la acción cierre el movimiento y desaparezca el formulario.
    const [confirmacion, setConfirmacion] = useState({ id: '', mensaje: '' });
    const m = consulta.datos?.movimiento;
    return <main className={styles.pagina}>
        <h1>Movimiento documental</h1>
        {confirmacion.id === id && <p role="status" className={styles.exito}>
            {confirmacion.mensaje}
        </p>}
        <EstadoCarga {...consulta} reintentar={consulta.recargar} />
        {m && <section className={styles.tarjeta}>
            <h2>
                {m.codigo} · <EstadoBadge estado={m.estado} />
            </h2>
            <dl className={styles.datos}>
                <div>
                    <dt>Origen</dt>
                    <dd>
                        {m.usuario_origen} · {m.oficina_origen}
                    </dd>
                </div>
                <div>
                    <dt>Destino</dt>
                    <dd>
                        {m.usuario_destino} · {m.oficina_destino}
                    </dd>
                </div>
                <div>
                    <dt>Autorizado por (identificador historico)</dt>
                    <dd>
                        {m.decidido_por_id ?? 'Derivacion directa del custodio'}
                    </dd>
                </div>
                <div>
                    <dt>Registro</dt>
                    <dd>
                        {fechaLocal(m.fecha_creacion)}
                    </dd>
                </div>
                <div>
                    <dt>Salida</dt>
                    <dd>
                        {m.fecha_salida ? fechaLocal(m.fecha_salida) : 'Sin salida registrada'}
                    </dd>
                </div>
                <div>
                    <dt>Recepción</dt>
                    <dd>
                        {m.fecha_recepcion ? fechaLocal(m.fecha_recepcion) : 'Sin recepción confirmada'}
                    </dd>
                </div>
                <div>
                    <dt>Usuario que confirmó la recepción</dt>
                    <dd>
                        {m.recibido_por_id ?? 'Sin recepcion'}
                    </dd>
                </div>
                <div>
                    <dt>Fecha y usuario de rechazo</dt>
                    <dd>
                        {m.fecha_rechazo ? `${fechaLocal(m.fecha_rechazo)} · Cuenta ${m.rechazado_por_id}` : 'Sin rechazo'}
                    </dd>
                </div>
                <div>
                    <dt>Rechazo</dt>
                    <dd>
                        {m.motivo_rechazo ?? 'Sin rechazo'}
                    </dd>
                </div>
                <div>
                    <dt>Recuperación en origen</dt>
                    <dd>
                        {m.fecha_confirmacion_devolucion ? fechaLocal(m.fecha_confirmacion_devolucion) : 'Sin recuperación registrada'}
                    </dd>
                </div>
                <div>
                    <dt>Fecha y usuario de cancelacion</dt>
                    <dd>
                        {m.fecha_cancelacion ? `${fechaLocal(m.fecha_cancelacion)} · Cuenta ${m.cancelado_por_id}` : 'Sin cancelacion'}
                    </dd>
                </div>
                <div>
                    <dt>Cancelación</dt>
                    <dd>
                        {m.motivo_cancelacion ?? 'Sin cancelación'}
                    </dd>
                </div>
            </dl>
            <div className={styles.acciones}>
                <Link className={styles.boton} to={`/movimientos?documento_id=${m.documento_id}`}>Recorrido completo</Link>
                <Link className={styles.secundario} to="/movimientos">Volver</Link>
            </div>
            <MovimientoAcciones movimiento={m} actualizar={/** Conserva el mensaje de confirmación para este movimiento y recarga su estado autorizado. */ mensaje => {
                setConfirmacion({ id, mensaje });
                consulta.recargar();
            }} />
        </section>}
    </main>;
}
