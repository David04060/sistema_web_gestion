import {DelegacionesPersonalesPage} from './DelegacionesPersonalesPage';
import documentoStyles from '../../documentos/styles/Documentos.module.css';
import {etiquetasEstado} from '../../../lib/estados-documentales';
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
export function MovimientosListaPage(){const auth=useAuth();return auth.sesion!.usuario.rol==='Usuario'?<DelegacionesPersonalesPage/>:<MovimientosInstitucionalesPage/>;}
function MovimientosInstitucionalesPage() {
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

            </div>
            <Link className={styles.secundario} to={params.get('documento_id')?`/documentos/${encodeURIComponent(params.get('documento_id')!)}`:'/documentos'}>{params.get('documento_id')?'Volver al documento':'Consultar documentos'}</Link>
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
                        {['EN_TRASLADO', 'RECIBIDO', 'RECHAZADO', 'CANCELADO'].map(/** Presenta un estado de movimiento aprobado como filtro. */  e => <option key={e} value={e}>
                            {etiquetasEstado[e]??e}
                        </option>)}
                    </select>
                </div>
            </div>
            <p>
                <Link className={styles.secundario} to="/documentos?situacion=PENDIENTE_DECISION">Consultar pendientes de decisión</Link>
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
                                {fechaLocal(m.fecha_creacion)}<br />{m.registrado_por??'Persona no disponible'}
                            </td>
                            <td>
                                <Link className={styles.secundario} to={`/movimientos/${m.id}`}>Ver detalle</Link>
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
    const personal=useAuth().sesion!.usuario.rol==='Usuario';
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
            <div className={documentoStyles.recorrido}>
                <section className={documentoStyles.cuadroRecorrido}><h3>Participantes</h3><dl>
                    <div><dt>Origen</dt><dd>{m.usuario_origen}<span>{m.oficina_origen}</span></dd></div>
                    <div><dt>Destino</dt><dd>{m.usuario_destino}<span>{m.oficina_destino}</span></dd></div>
                    <div><dt>Registrado por</dt><dd>{m.registrado_por??'Persona no disponible'}</dd></div>
                    <div><dt>Decisión de Dirección</dt><dd>{m.decidido_por??'Derivación directa'}</dd></div>
                </dl></section>
                <section className={documentoStyles.cuadroRecorrido}><h3>Acciones y fechas</h3><ol className={documentoStyles.hitos}>
                    <li><strong>Registro</strong><span>{m.registrado_por??'Persona no disponible'}</span><time dateTime={m.fecha_creacion}>{fechaLocal(m.fecha_creacion)}</time></li>
                    {m.fecha_salida&&<li><strong>Salida</strong><span>{m.trasladado_por??m.registrado_por??'Persona no disponible'}</span><time dateTime={m.fecha_salida}>{fechaLocal(m.fecha_salida)}</time></li>}
                    {m.fecha_recepcion&&<li><strong>Recepción confirmada</strong><span>{m.recibido_por??'Persona no disponible'}</span><time dateTime={m.fecha_recepcion}>{fechaLocal(m.fecha_recepcion)}</time></li>}
                    {m.fecha_rechazo&&<li><strong>Rechazo</strong><span>{m.rechazado_por??'Persona no disponible'}</span><time dateTime={m.fecha_rechazo}>{fechaLocal(m.fecha_rechazo)}</time><p>{m.motivo_rechazo}</p></li>}
                    {m.fecha_confirmacion_devolucion&&<li><strong>Recuperación en origen</strong><span>{m.devolucion_confirmada_por??'Persona no disponible'}</span><time dateTime={m.fecha_confirmacion_devolucion}>{fechaLocal(m.fecha_confirmacion_devolucion)}</time></li>}
                    {m.fecha_cancelacion&&<li><strong>Cancelación</strong><span>{m.cancelado_por??'Persona no disponible'}</span><time dateTime={m.fecha_cancelacion}>{fechaLocal(m.fecha_cancelacion)}</time><p>{m.motivo_cancelacion}</p></li>}
                </ol></section>
            </div>
            <div className={styles.acciones}>
                {!personal&&<Link className={styles.boton} to={`/movimientos?documento_id=${m.documento_id}`}>Recorrido completo</Link>}
                <Link className={styles.secundario} to={`/documentos/${m.documento_id}`}>Ver documento</Link>
                <Link className={styles.secundario} to="/movimientos">Volver a movimientos</Link>
            </div>
            {!personal&&<MovimientoAcciones movimiento={m} actualizar={/** Conserva el mensaje de confirmación para este movimiento y recarga su estado autorizado. */ mensaje => {
                setConfirmacion({ id, mensaje });
                consulta.recargar();
            }} />}
        </section>}
    </main>;
}
