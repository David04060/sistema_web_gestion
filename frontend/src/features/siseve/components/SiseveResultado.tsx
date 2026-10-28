import { EstadoBadge } from '../../../components/ui/EstadoBadge';
import { etiquetaClasificacion } from '../../documentos/clasificacion';
import type { Resultado } from '../api/siseve.api';
import type { Preparacion } from './SiseveOperacionForm';
import { DocumentoHistorial } from '../../documentos/components/DocumentoHistorial';
import { fechaLocal } from '../../../lib/fechas';
import styles from '../../../components/ui/Admin.module.css';
interface Props {
    acciones: {
        id: string;
        nombre: string;
    }[];
    resultado: Resultado;
    preparar: (datos: Omit<Preparacion, 'revision'>) => void;
}
/** Solo representa resultados validados de la última operación; los botones preparan otra verificación. */
export function SiseveResultado({ resultado: r, preparar, acciones }: Props) {
    if ('documentos' in r)
        return <section className={styles.tarjeta}>
            <h2>Documentos SíseVe autorizados</h2>
            <p>
                {r.total} registros · Página {r.pagina}
            </p>
            <div className={styles.tabla}>
                <table>
                    <thead>
                        <tr>
                            <th>Código</th>
                            <th>Asunto</th>
                            <th>Clasificación del registro</th>
                            <th>Responsable / oficina</th>
                            <th>Estado</th>
                            <th>Operación</th>
                        </tr>
                    </thead>
                    <tbody>
                        {r.documentos.map(/** Presenta un documento protegido devuelto por una operación autorizada. */  d => <tr key={d.id}>
                            <td>
                                {d.codigo}
                            </td>
                            <td>
                                {d.asunto}
                            </td>
                            <td>{etiquetaClasificacion(d.clasificacion_registro)}</td>
                            <td>
                                {d.responsable} · {d.oficina}
                            </td>
                            <td>
                                <EstadoBadge estado={d.estado_tramite} />
                            </td>
                            <td>
                                <button className={styles.secundario} onClick={/** Prepara la consulta de detalle; su ejecución volverá a exigir la clave adicional. */() => preparar({ operacion: 'detalle', id: d.id })}>Preparar consulta</button>
                            </td>
                        </tr>)}
                    </tbody>
                </table>
            </div>
            {!r.documentos.length && <p>No hay registros autorizados para esta consulta.</p>}
        </section>;
    if ('documento' in r) {
        const d = r.documento;
        return <section className={styles.tarjeta}>
            <h2>
                {d.codigo}
            </h2>
            <p>
                {d.asunto}
            </p>
            <dl className={styles.datos}>
                <div><dt>Clasificación del registro</dt><dd>{etiquetaClasificacion(d.clasificacion_registro)}</dd></div>
                <div>
                    <dt>Responsable</dt>
                    <dd>
                        {d.responsable} · {d.oficina}
                    </dd>
                </div>
                <div>
                    <dt>Circulación</dt>
                    <dd>
                        <EstadoBadge estado={d.estado_tramite} />
                        {d.estado_tramite === 'PENDIENTE_DECISION' && (d.destinatario_autorizado_id ? ' · Autorizado; espera salida' : ' · Espera decisión')}
                    </dd>
                </div>
                <div>
                    <dt>Ubicación</dt>
                    <dd>
                        {d.archivador_id ? `${d.estante} / Archivador ${d.archivador_numero}` : ['EN_TRASLADO', 'RECHAZADO'].includes(d.estado_tramite) ? 'Sin ubicación física confirmada durante traslado o recuperación' : 'Sin archivador asignado'}
                    </dd>
                </div>
                <div>
                    <dt>Remitente</dt>
                    <dd>
                        {d.remitente ?? 'No registrado'}
                    </dd>
                </div>
                <div>
                    <dt>Observaciones</dt>
                    <dd>
                        {d.observaciones ?? 'Sin observaciones'}
                    </dd>
                </div>
                <div>
                    <dt>Registro</dt>
                    <dd>
                        {fechaLocal(d.fecha_creacion)}
                    </dd>
                </div>
            </dl>
            <div className={styles.acciones}>
                <button className={styles.secundario} onClick={/** Prepara la consulta del historial sin ejecutar todavía otra operación protegida. */() => preparar({ operacion: 'historial', id: d.id })}>Preparar historial</button>
                <button className={styles.secundario} onClick={/** Prepara la consulta del recorrido sin reutilizar la clave anterior. */() => preparar({ operacion: 'movimientos', id: d.id })}>Preparar recorrido</button>
                {acciones.map(/** Presenta una acción documental permitida para preparar una nueva solicitud protegida. */  a => <button key={a.id} className={styles.secundario} onClick={/** Prepara la acción con contenido del documento; la clave debe introducirse de nuevo. */() => preparar({ operacion: a.id, id: d.id, asunto: d.asunto, remitente: d.remitente, observaciones: d.observaciones })}>Preparar {a.id}
                </button>)}
            </div>
        </section>;
    }
    if ('historial' in r)
        return <section className={styles.tarjeta}>
            <h2>Historial protegido</h2>
            <p>La auditoría restringida conserva actores, fechas y campos modificados. Los triggers existentes omiten valores confidenciales y motivos en texto claro.</p>
            <DocumentoHistorial historial={r.historial} />
        </section>;
    if ('movimientos' in r)
        return <section className={styles.tarjeta}>
            <h2>Recorrido protegido</h2>
            <p>
                {r.total} movimientos · Página {r.pagina}
            </p>
            <div className={styles.tabla}>
                <table>
                    <thead>
                        <tr>
                            <th>Código</th>
                            <th>Origen</th>
                            <th>Destino</th>
                            <th>Estado</th>
                            <th>Operación</th>
                        </tr>
                    </thead>
                    <tbody>
                        {r.movimientos.map(/** Presenta un movimiento protegido con metadatos de origen y destino. */  m => <tr key={m.id}>
                            <td>
                                {m.codigo}
                            </td>
                            <td>
                                {m.usuario_origen} · {m.oficina_origen}
                            </td>
                            <td>
                                {m.usuario_destino} · {m.oficina_destino}
                            </td>
                            <td>
                                <EstadoBadge estado={m.estado} />
                            </td>
                            <td>
                                <button className={styles.secundario} onClick={/** Prepara el detalle del movimiento sin conceder una autorización persistente. */() => preparar({ operacion: 'movimiento', id: m.id })}>Preparar detalle</button>
                            </td>
                        </tr>)}
                    </tbody>
                </table>
            </div>
        </section>;
    if ('movimiento' in r) {
        const m = r.movimiento;
        return <section className={styles.tarjeta}>
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
                    <dt>Salida</dt>
                    <dd>
                        {m.fecha_salida ? fechaLocal(m.fecha_salida) : 'No registrada'}
                    </dd>
                </div>
                <div>
                    <dt>Recepción</dt>
                    <dd>
                        {m.fecha_recepcion ? fechaLocal(m.fecha_recepcion) : 'No confirmada'}
                    </dd>
                </div>
                <div>
                    <dt>Rechazo</dt>
                    <dd>
                        {m.motivo_rechazo ?? 'Sin rechazo'}
                    </dd>
                </div>
                <div>
                    <dt>Recuperación</dt>
                    <dd>
                        {m.fecha_confirmacion_devolucion ? fechaLocal(m.fecha_confirmacion_devolucion) : 'Sin recuperación'}
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
                {acciones.map(/** Presenta una acción física permitida sobre el movimiento consultado. */  a => <button key={a.id} className={styles.secundario} onClick={/** Prepara una acción física que exigirá otra verificación de clave al ejecutarse. */() => preparar({ operacion: a.id, id: m.id })}>
                    {a.nombre}
                </button>)}
            </div>
        </section>;
    }
    return <section className={styles.tarjeta}>
        <h2>Opciones autorizadas</h2>
        <p>Catálogos recuperados. Puede utilizarlos al preparar una operación; esta consulta no autoriza operaciones posteriores.</p>
        <p>
            {r.archivadores.length} archivadores propios disponibles.</p>
    </section>;
}
