import { ArchivoPdf } from '../components/ArchivoPdf';
import documentoStyles from '../styles/Documentos.module.css';
import {EntregaSecretaria,situacionesEntrega} from '../components/EntregaSecretaria';
import { EstadoBadge } from '../../../components/ui/EstadoBadge';
import { etiquetaClasificacion } from '../clasificacion';
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
        <h1>Documento</h1>
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
                    <div><dt>Clasificación del registro</dt><dd>{etiquetaClasificacion(d.clasificacion_registro)}</dd></div>
                    <div>
                        <dt>Tipo</dt>
                        <dd>
                            {d.tipo_documental}
                        </dd>
                    </div>
                    <div>
                        <dt>Registrado por</dt>
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
                        <dt>Responsable actual</dt>
                        <dd>
                            {d.responsable}
                        </dd>
                    </div>
                    <div>
                        <dt>Oficina</dt>
                        <dd>
                            {d.oficina}
                        </dd>
                    </div>
                    <div>
                        <dt>{d.entrega||d.registro_personal?'Situación':'Estado de circulación'}</dt>
                        <dd>
                            {d.entrega?situacionesEntrega[d.entrega.situacion]:d.registro_personal?'Sin delegación':<EstadoBadge estado={d.estado_tramite} />}
                        </dd>
                    </div>
                    <div>
                        <dt>Estado del registro</dt>
                        <dd>
                            {d.activo ? 'Vigente' : 'Anulado'}
                        </dd>
                    </div>
                    <div>
                        <dt>Ubicación registrada</dt>
                        <dd>
                            {d.entrega?.ubicacion_direccion ?? (d.archivador_id ? `Estante ${d.estante} · Archivador ${d.archivador_numero}` : d.estado_tramite === 'EN_TRASLADO' ? 'Original en traslado; sin ubicacion fisica confirmada' : d.estado_tramite === 'RECHAZADO' ? 'Rechazado; recuperacion fisica pendiente' : 'Sin archivador registrado')}
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
                    <Link className={styles.boton} to={`/movimientos?documento_id=${d.id}`}>{d.registro_personal?'Consultar delegación':'Consultar movimientos anteriores'}</Link>
                    {d.permisos.registrar_relacionado && <Link className={styles.boton} to={`/documentos/nuevo?origen=${d.id}`}>Registrar documento relacionado</Link>}
                    <Link className={styles.secundario} to="/documentos">Volver al listado</Link>
                </div>
            </section>
            <ArchivoPdf key={id} token={token} id={id} />
            {d.documento_origen && <section className={`${styles.tarjeta} ${documentoStyles.origen}`}>
                <h2>Documento de origen</h2>
                <Link to={`/documentos/${d.documento_origen.id}`}>{d.documento_origen.codigo}</Link>
                <p>{d.documento_origen.tipo_documental}</p><p>{d.documento_origen.asunto}</p>
                <p>{d.documento_origen.relacion_por} · {fechaLocal(d.documento_origen.relacion_fecha)}</p>
            </section>}
            <section className={styles.tarjeta}>
                <h2>Documentos relacionados</h2>
                <div className={documentoStyles.relacionados}>
                    {d.documentos_relacionados.map(r=><article key={r.id}>
                        <div className={documentoStyles.cabeceraRelacion}><Link to={`/documentos/${r.id}`}>{r.codigo}</Link><span>{etiquetaClasificacion(r.clasificacion_registro)}</span></div>
                        <p className={documentoStyles.tipoRelacion}>{r.tipo_documental}</p><p>{r.asunto}</p>
                        <time dateTime={r.fecha_creacion}>{fechaLocal(r.fecha_creacion)}</time>
                        <Link className={styles.secundario} to={`/documentos/${r.id}`}>Ver detalle</Link>
                    </article>)}
                </div>
                {!d.documentos_relacionados.length&&<p>Sin documentos relacionados.</p>}
            </section>
            {(d.entrega||d.registro_personal) && <EntregaSecretaria documento={d} token={token} actualizar={mensaje=>{setConfirmacion({id,mensaje});consulta.recargar();}} />}
            {!d.entrega && !d.registro_personal && <DocumentoAcciones documento={d} token={token} actualizar={/** Conserva el mensaje de la acción para este ID y vuelve a consultar permisos y detalle. */ mensaje => {
                setConfirmacion({ id, mensaje });
                consulta.recargar();
            }} />}
            <section className={styles.tarjeta}>
                <h2>Historial</h2>
                {d.entrega ? <><DocumentoHistorial historial={(consulta.datos?.historial ?? []).filter(h=>['Registro','Asignación','Delegación','Delegación personal','Guardado en Dirección','Guardado en Secretaría','Entrega confirmada'].includes(h.accion))} /><details><summary>Antecedentes y auditoría de datos</summary><DocumentoHistorial historial={(consulta.datos?.historial ?? []).filter(h=>!['Registro','Asignación','Delegación','Guardado en Dirección','Guardado en Secretaría','Entrega confirmada'].includes(h.accion))} /></details></> : <DocumentoHistorial historial={consulta.datos?.historial ?? []} />}
            </section>
        </>}
    </main>;
}
