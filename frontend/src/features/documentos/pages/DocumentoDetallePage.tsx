import { RecorridoDocumento } from '../components/RecorridoDocumento';
import { CicloIngreso } from '../../ingresos/components/CicloIngreso';
import { IngresoDocumento } from '../../ingresos/components/IngresoDocumento';
import { DocumentoArchivo } from '../components/DocumentoArchivo';
import { EstadoBadge } from '../../../components/ui/EstadoBadge';
import { DocumentoHistorial } from '../components/DocumentoHistorial';
import { DocumentoAcciones } from '../components/DocumentoAcciones';
import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { fechaLocal } from '../../../lib/fechas';
import * as api from '../api/documentos.api';
import styles from '../../../components/ui/Admin.module.css';
/** El historial completo se obtiene solo después de autorizar el contenido en Express. */
export function DocumentoDetallePage() {
    const { id = '' } = useParams();
    const token = useAuth().sesion!.token;
    const consulta = useConsulta(useCallback(/** Consulta detalle e historial autorizados en paralelo para componer la pantalla. */ async () => {
        const [detalle, historial] = await Promise.all([api.detalle(token, id), api.historial(token, id)]);
        return { ...detalle, ...historial };
    }, [token, id]));
    // La confirmación pertenece a la página: sobrevive al desmontaje del formulario al recargar.
    const [confirmacion, setConfirmacion] = useState({ id: '', mensaje: '' });
    const d = consulta.datos?.documento;
    return <main className={styles.pagina}>
        <h1>Documento físico</h1>
        {confirmacion.id === id && <p role="status" className={styles.exito}>
            {confirmacion.mensaje}
        </p>}
        <EstadoCarga {...consulta} reintentar={consulta.recargar} />
        {d && <>
            <section className={styles.tarjeta}>
                <h2>
                    {d.codigo}
                </h2>
                <p>
                    {d.asunto}
                </p>
                <dl className={styles.datos}>
                    {d.archivo_id !== undefined && <>
                        <div><dt>Archivo institucional de pertenencia</dt><dd>{d.archivo_nombre ?? 'Archivo institucional pendiente de clasificación'}</dd></div>
                        <div><dt>Responsable vigente del archivo</dt><dd>{d.archivo_responsable || 'Pendiente de clasificación'}</dd></div>
                    </>}
                    {d.oficina_registro && <div><dt>Oficina inicial de registro (hecho histórico)</dt><dd>{d.oficina_registro}</dd></div>}
                    <div>
                        <dt>Tipo</dt>
                        <dd>
                            {d.tipo_documental}
                        </dd>
                    </div>
                    <div>
                        <dt>Registrador original</dt>
                        <dd>
                            {d.registrador}
                        </dd>
                    </div>
                    <div>
                        <dt>Fecha de registro</dt>
                        <dd>
                            {fechaLocal(d.fecha_creacion)}
                        </dd>
                    </div>
                    <div>
                        <dt>Custodio actual del original</dt>
                        <dd>
                            {d.responsable}
                        </dd>
                    </div>
                    <div>
                        <dt>Oficina de custodia actual</dt>
                        <dd>
                            {d.oficina}
                        </dd>
                    </div>
                    <div>
                        <dt>Estado de circulación</dt>
                        <dd>
                            <EstadoBadge estado={d.estado_tramite} />
                        </dd>
                    </div>
                    <div>
                        <dt>Estado del registro</dt>
                        <dd>
                            {d.activo ? 'Vigente' : 'Anulado'}
                        </dd>
                    </div>
                    <div>
                        <dt>Ubicación física confirmada</dt>
                        <dd>
                            {d.archivador_id ? `Estante ${d.estante} · Archivador ${d.archivador_numero}` : d.estado_tramite === 'EN_TRASLADO' ? 'Original en traslado; sin ubicacion fisica confirmada' : d.estado_tramite === 'RECHAZADO' ? 'Rechazado; recuperacion fisica pendiente' : 'Sin archivador registrado'}
                        </dd>
                    </div>
                    {d.ultima_ubicacion && <div>
                        <dt>Ultima ubicacion auditada (antecedente)</dt>
                        <dd>
                            {d.ultima_ubicacion.nombre} · {fechaLocal(d.ultima_ubicacion.fecha)}. No confirma la posicion actual del original.</dd>
                    </div>}
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
                </dl>
                <div className={styles.acciones}>
                    <Link className={styles.boton} to={`/movimientos?documento_id=${d.id}`}>Consultar recorrido</Link>
                    <Link className={styles.secundario} to="/documentos">Volver al listado</Link>
                </div>
            </section>
            {d.permisos.vincular_archivo && <DocumentoArchivo token={token} id={d.id} actualizar={() => {
                setConfirmacion({ id, mensaje: 'Documento vinculado al archivo institucional. Se conservaron su identidad y custodia.' });
                consulta.recargar();
            }} />}
            {d.ciclo_ingresos_ordinarios_habilitado ? <CicloIngreso token={token} id={d.id} actualizar={consulta.recargar}/> : d.ingreso_mesa_partes !== undefined && <IngresoDocumento ingreso={d.ingreso_mesa_partes} />}
            <DocumentoAcciones documento={d} token={token} actualizar={/** Conserva el mensaje de la acción para este ID y vuelve a consultar permisos y detalle. */ mensaje => {
                setConfirmacion({ id, mensaje });
                consulta.recargar();
            }} />
            <RecorridoDocumento token={token} id={d.id}/>
            <section className={styles.tarjeta}>
                <h2>Historial de modificaciones</h2>
                <DocumentoHistorial historial={consulta.datos?.historial ?? []} />
            </section>
        </>}
    </main>;
}
