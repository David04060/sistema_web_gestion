import { useCallback, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, etiquetas, rutaUnidades, type DocumentoActual } from '../../../api/documental';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { ArchivoPdf } from '../components/ArchivoPdf';
import { DestinoDocumental, destinoVacio, datosDestino } from '../components/DestinoDocumental';
import { fechaLocal } from '../../../lib/fechas';
import styles from '../../../components/ui/Admin.module.css';
import {HistorialDocumento} from '../components/HistorialDocumento';
import {ApiError} from '../../../api/client';
import {AuditoriaDocumento} from '../components/AuditoriaDocumento';
export function DocumentoDetallePage() {
    const { id = '' } = useParams(), { token } = useAuth().sesion!;
    const navegacion=useLocation(),mensajeRuta=(navegacion.state as {mensaje?:unknown}|null)?.mensaje;
    const consulta = useConsulta(useCallback(async () => ({ detalle: await api.detalle(token, id), historial: await api.historial(token, id) }), [token, id]));
    const [confirmado,setConfirmado]=useState<{contexto:string;documento:DocumentoActual;mensaje:string}>();
    const [revisionAuditoria,setRevisionAuditoria]=useState(0);
    const contexto=token+':'+id;
    const base=consulta.datos?.detalle.documento;
    const vigente=confirmado?.contexto===contexto?confirmado:undefined;
    const d = base&&vigente&&BigInt(vigente.documento.revision)>=BigInt(base.revision)?vigente.documento:base;
    function actualizar(documento:DocumentoActual,mensaje:string){setConfirmado({contexto,documento,mensaje});consulta.recargar();}
    return <main className={styles.pagina}><h1>Documento</h1>{typeof mensajeRuta==='string'&&!vigente&&<p className={styles.exito} role="status">{mensajeRuta}</p>}{vigente&&<p className={styles.exito} role="status">{vigente.mensaje}</p>}<EstadoCarga {...consulta} reintentar={consulta.recargar}/>
 {d && <><section className={styles.tarjeta}><h2>{d.codigo_visible}</h2><p>{d.asunto}</p><dl className={styles.datos}>
 <div><dt>Registrado por</dt><dd>{d.registrado_por_nombre}</dd></div><div><dt>Clasificación</dt><dd>{d.clasificacion === 'RECIBIDO' ? 'Recibido' : d.clasificacion === 'EMITIDO' ? 'Emitido' : 'Sin clasificar'}</dd></div><div><dt>Tipo registrado</dt><dd>{d.tipo_nombre_guardado}</dd></div><div><dt>Situación</dt><dd>{etiquetas[d.situacion]}</dd></div><div><dt>Fecha de registro</dt><dd>{fechaLocal(d.creado_en)}</dd></div><div><dt>Remitente</dt><dd>{d.remitente || '—'}</dd></div><div><dt>Observaciones</dt><dd>{d.observaciones || '—'}</dd></div>
 <div><dt>Ubicación registrada</dt><dd>{d.ubicacion ? d.ubicacion.oficina_nombre_guardado + ' / ' + d.ubicacion.ruta_ubicacion_guardada : 'Sin ubicación registrada'}</dd></div>
 {d.delegacion && <><div><dt>Delegado a</dt><dd>{d.delegacion.nombre_persona_guardado}</dd></div><div><dt>Indicado por</dt><dd>{d.delegacion.actor} · {fechaLocal(d.delegacion.delegado_en)}</dd></div>{d.delegacion.observaciones && <div><dt>Observaciones de delegación</dt><dd>{d.delegacion.observaciones}</dd></div>}</>}
 {d.valores.map(v => <div key={v.campo_id}><dt>{v.nombre_guardado}</dt><dd>{v.valor || '—'}</dd></div>)}</dl>
 <div className={styles.acciones}>{d.permisos.corregir && <Link className={styles.boton} to={'/documentos/' + d.id + '/editar'}>Corregir datos</Link>}{d.permisos.relacionar && <Link className={styles.secundario} to={'/documentos/nuevo?origen=' + d.id}>Registrar documento relacionado</Link>}<Link className={styles.secundario} to="/documentos">Volver al listado</Link></div>
 </section><ArchivoPdf key={'pdf-'+d.id + '-' + d.revision} token={token} id={d.id} alCambiar={()=>{setRevisionAuditoria(v=>v+1);consulta.recargar();}}/>
 {(d.permisos.delegar || d.permisos.ubicar || d.permisos.anular) && <Acciones key={'acciones-'+d.id + '-' + d.revision} token={token} documento={d} actualizar={actualizar}/>}
 <section className={styles.tarjeta}><h2>Documentos relacionados</h2>{d.relacionados.length ? <ul>{d.relacionados.map(v => <li key={v.id}><Link to={'/documentos/' + v.id}>{v.codigo_visible}</Link> — {v.asunto}{v.id === v.origen_id ? ' (origen)' : ''}</li>)}</ul> : <p>Sin documentos relacionados.</p>}</section>
 <HistorialDocumento historial={consulta.datos?.historial.historial??[]}/><AuditoriaDocumento key={'auditoria-'+d.id} token={token} id={d.id} revision={d.revision+':'+revisionAuditoria}/></>}

 </main>;
}
function Acciones({ token, documento: d, actualizar }: {
    token: string;
    documento: DocumentoActual;
    actualizar: (documento:DocumentoActual,mensaje:string) => void;
}) {
    const navegar = useNavigate(), [destino, setDestino] = useState(destinoVacio), [unidad, setUnidad] = useState(''), [motivo, setMotivo] = useState(''), [error, setError] = useState(''), [ocupado, setOcupado] = useState(false);
    const enviando=useRef(false),[confirmacion,setConfirmacion]=useState<'delegar'|'anular'|null>(null);
    const necesitaOpciones = d.permisos.delegar || d.permisos.ubicar;
    const opciones = useConsulta(useCallback(() => api.opciones(token), [token]), { habilitada: necesitaOpciones });
    async function ejecutar(tipo: 'delegar' | 'ubicar' | 'anular',confirmado=false) {
        if(enviando.current)return;
        setError('');
        if((tipo==='delegar'||tipo==='anular')&&!confirmado){setConfirmacion(tipo);return;}
        setConfirmacion(null);
        enviando.current=true;
        setOcupado(true);
        try {
            if (tipo === 'delegar') {
                const resultado=await api.delegar(token,d.id,{revision:d.revision,...datosDestino(destino)});
                actualizar(resultado.documento,'Delegación confirmada correctamente.');
                return;
            }
            if (tipo === 'ubicar') {
                if (!unidad)
                    throw Error('Selecciona una unidad propia.');
                const resultado=await api.ubicar(token, d.id, { revision: d.revision, unidad_id: unidad });
                actualizar(resultado.documento,'Ubicación guardada correctamente.');
                return;
            }
            if (tipo === 'anular') {
                if (!motivo.trim())
                    throw Error('El motivo es obligatorio.');
                await api.anular(token, d.id, { revision: d.revision, motivo: motivo.trim() });
                navegar('/documentos', { replace: true,state:{mensaje:'Registro anulado. Se conserva su historial.'} });
                return;
            }
        }
        catch (e) {
            const detalle=e instanceof Error?e.message:'No se pudo completar la operación';
            const estado=e instanceof ApiError&&e.status>0?' (HTTP '+e.status+')':'';
            setError(detalle+estado+(tipo==='delegar'?' La selección se conserva para reintentar.':''));
            enviando.current=false;
        }
        finally {
            if(tipo!=='delegar')enviando.current=false;
            if(!enviando.current)setOcupado(false);
        }
    }
    return <section className={styles.tarjeta}><h2>Acciones autorizadas</h2>{confirmacion&&<section className={styles.aviso} aria-label="Confirmar acción documental"><p>{confirmacion==='delegar'?'¿Confirmar la delegación a la persona seleccionada?':'¿Anular este registro? Se conservará su historia y solo podrá consultarlo Superadministración.'}</p><div className={styles.acciones}><button type="button" className={styles.boton} disabled={ocupado} onClick={()=>void ejecutar(confirmacion,true)}>{confirmacion==='delegar'?'Delegar documento':'Anular registro'}</button><button type="button" className={styles.secundario} disabled={ocupado} onClick={()=>setConfirmacion(null)}>Cancelar</button></div></section>}{necesitaOpciones && <EstadoCarga {...opciones} reintentar={opciones.recargar}/>}
 {d.permisos.delegar && opciones.datos && <details><summary>Delegar documento</summary><form onSubmit={e => { e.preventDefault(); void ejecutar('delegar'); }}><fieldset className={styles.grupoDestino} disabled={ocupado||confirmacion!==null}><DestinoDocumental valor={destino} cambiar={setDestino} opciones={opciones.datos}/></fieldset><button className={styles.boton} disabled={ocupado}>{ocupado?'Procesando…':'Confirmar delegación'}</button></form></details>}
 {d.permisos.ubicar && opciones.datos && <details><summary>Guardar en una ubicación propia</summary><form onSubmit={e => { e.preventDefault(); void ejecutar('ubicar'); }}><label className={styles.campo}>Unidad<select required value={unidad} onChange={e => setUnidad(e.target.value)}><option value="">Seleccionar unidad</option>{opciones.datos.unidades.map(u => <option key={u.id} value={u.id}>{rutaUnidades(opciones.datos?.unidades ?? [], u.id)}</option>)}</select></label>{!opciones.datos.unidades.length && <p>Primero crea una <Link to="/ubicaciones">unidad de ubicación</Link>.</p>}<button className={styles.boton} disabled={ocupado || !unidad}>Guardar ubicación</button></form></details>}
 {d.permisos.anular && <details><summary>Anular registro</summary><form onSubmit={e => { e.preventDefault(); void ejecutar('anular'); }}><label className={styles.campo}>Motivo de anulación<textarea required maxLength={1000} value={motivo} onChange={e => setMotivo(e.target.value)}/></label><button className={styles.peligro} disabled={ocupado}>Anular registro</button></form></details>}{ocupado&&<p role="status">Procesando…</p>}{error && <p className={styles.error} role="alert">{error}</p>}
 </section>;
}
