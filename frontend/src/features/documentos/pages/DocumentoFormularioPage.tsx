import {DelegacionPersonalCampos,destinoPersonalVacio,construirDestinoPersonal} from '../components/DelegacionPersonalCampos';
import {DecisionDireccionCampos,decisionVacia,construirDecision,type DecisionDireccion} from '../components/DecisionDireccionCampos';
import documentoStyles from '../styles/Documentos.module.css';
import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { RegistroDocumentoOpciones } from '../components/RegistroDocumentoOpciones';
import { etiquetaClasificacion, type ClasificacionRegistro } from '../clasificacion';
import { useForm } from 'react-hook-form';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { formularioDocumentoSchema, type FormularioDocumento, type Documento } from '../schemas/documentos.schema';
import * as api from '../api/documentos.api';
import styles from '../../../components/ui/Admin.module.css';
/** Obtiene catalogos reales y mantiene los campos generados fuera del formulario editable. */
export function DocumentoFormularioPage() {
    const { id } = useParams();
    const [params] = useSearchParams();
    const origenId = !id ? params.get('origen') ?? undefined : undefined;
    const seleccion = params.get('clasificacion');
    const clasificacion = seleccion === 'RECIBIDO' || seleccion === 'EMITIDO' ? seleccion : null;
    const token = useAuth().sesion!.token;
    const consulta = useConsulta(useCallback(/** Carga opciones y, cuando corresponde, el detalle del documento que se corrige. */ async () => ({ opciones: await api.opciones(token), detalle: id ? await api.detalle(token, id) : null, origen: origenId ? await api.detalle(token,origenId) : null }), [token, id,origenId]));
    return <main className={styles.pagina}>
        <h1>
            {id ? 'Corregir documento' : clasificacion === 'RECIBIDO' ? 'Registrar documento recibido' : clasificacion === 'EMITIDO' ? 'Registrar documento emitido' : 'Seleccionar registro documental'}
        </h1>
        <EstadoCarga {...consulta} reintentar={consulta.recargar} />
        {consulta.datos?.origen && <section className={`${styles.tarjeta} ${documentoStyles.origen}`}><h2>Documento de origen</h2><Link to={`/documentos/${origenId}`}>{consulta.datos.origen.documento.codigo}</Link><p>{consulta.datos.origen.documento.tipo_documental}</p><p>{consulta.datos.origen.documento.asunto}</p></section>}
        {consulta.datos?.origen && !consulta.datos.origen.documento.permisos.registrar_relacionado ? <p role="alert">No puede registrar un documento relacionado desde este origen.</p> : consulta.datos && (!id && !consulta.datos.opciones.puede_registrar ? <p role="alert">No tiene permiso para registrar documentos o necesita una oficina asignada.</p> : !id && !clasificacion ? <><p>Clasificación</p><RegistroDocumentoOpciones origenId={origenId} /></> : id && !consulta.datos.detalle?.documento.permisos.editar ? <p role="alert">No tiene permiso para corregir este documento en su estado actual.</p> : <Formulario origenId={origenId} key={`${id??clasificacion}-${origenId??''}`} token={token} id={id} clasificacion={clasificacion} inicial={consulta.datos.detalle?.documento} opciones={consulta.datos.opciones} />)}
    </main>;
}
/**
 * Mantiene el formulario de contenido documental separado de la consulta inicial; en corrección exige motivo y conserva los campos no editables.
 * @param props - Propiedades tipadas del componente, con datos y callbacks de su pantalla.
 */
function Formulario({ token, id, inicial, opciones, clasificacion, origenId }: {
    origenId?:string;
    token: string;
    id: string | undefined;
    clasificacion: ClasificacionRegistro | null;
    inicial: Documento | undefined;
    opciones: Awaited<ReturnType<typeof api.opciones>>;
}) {
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const [delegar,setDelegar]=useState(false);
    const [personal,setPersonal]=useState(destinoPersonalVacio);
    const [decision,setDecision]=useState<DecisionDireccion>(decisionVacia);
    const { register, handleSubmit, formState: { isSubmitting } } = useForm<FormularioDocumento>({ defaultValues: { tipo_documental_id: inicial?.tipo_documental_id ?? '', asunto: inicial?.asunto ?? '', remitente: inicial?.remitente ?? '', observaciones: inicial?.observaciones ?? '', archivador_id: inicial?.archivador_id ?? '', motivo: '' } });
    /**
     * Valida contenido y motivo, adapta vacíos opcionales al contrato y navega al documento confirmado; mantiene el error de envío en el formulario.
     * @param valores - Campos del formulario antes de normalizar y validar.
     */
    async function guardar(valores: FormularioDocumento) {
        setError('');
        const validacion = formularioDocumentoSchema.safeParse(valores);
        if (!validacion.success) {
            setError(validacion.error.issues[0]?.message ?? 'Revise los datos');
            return;
        }
        if (id && !valores.motivo.trim()) {
            setError('El motivo de correccion es obligatorio');
            return;
        }
        const contenido = { asunto: valores.asunto, remitente: valores.remitente || null, observaciones: valores.observaciones || null };
        try {
            const decisionInicial=!id&&opciones.puede_decidir_registro?construirDecision(decision):undefined;
            const r = await api.guardar(token, id, id ? { ...contenido, motivo: valores.motivo } : { ...contenido, tipo_documental_id: valores.tipo_documental_id, archivador_id: opciones.puede_decidir_registro?null:valores.archivador_id || null, ...(decisionInicial?{decision_inicial:decisionInicial}:{}), ...(opciones.puede_delegar_personal&&delegar?{delegacion_personal:construirDestinoPersonal(personal)}:{}), clasificacion_registro: clasificacion, ...(origenId?{documento_origen_id:origenId}:{}) });
            navigate(`/documentos/${r.documento.id}`, { replace: true });
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo guardar');
        }
    }
    return <section className={styles.tarjeta}>
        <p><strong>Clasificación del registro: {etiquetaClasificacion(id ? inicial?.clasificacion_registro ?? null : clasificacion)}</strong></p>
        {!id && !opciones.puede_registrar ? <p role="alert">Necesita una oficina asignada para registrar documentos.</p> : <form className={documentoStyles.formulario} onSubmit={handleSubmit(guardar)}>
            <div className={styles.campo}>
                <label htmlFor="tipo">Tipo documental</label>
                {id ? <>
                    <input type="hidden" {...register('tipo_documental_id')} />
                    <p>
                        {inicial?.tipo_documental}
                    </p>
                </> : <select id="tipo" {...register('tipo_documental_id')} required>
                    <option value="">Seleccione</option>
                    {opciones.tipos.filter(/** Conserva tipos con prefijo y el tipo histórico del documento editado. */  t => t.prefijo_codigo || t.id === inicial?.tipo_documental_id).map(/** Presenta el tipo y su prefijo conservando el ID para el registro. */  t => <option key={t.id} value={t.id}>
                        {t.nombre} ({t.prefijo_codigo})</option>)}
                </select>}
            </div>
            {!id && !opciones.puede_decidir_registro && <div className={styles.campo}>
                <label htmlFor="archivo">Archivador propio (opcional)</label>
                <select id="archivo" {...register('archivador_id')}>
                    <option value="">Sin asignar</option>
                    {opciones.archivadores.map(/** Presenta un archivador autorizado para ubicar el original. */  a => <option key={a.id} value={a.id}>
                        {a.nombre}
                    </option>)}
                </select>
            </div>}
            <div className={styles.campo}>
                <label htmlFor="asunto">Asunto</label>
                <textarea id="asunto" {...register('asunto')} required maxLength={20000} />
            </div>
            <div className={styles.campo}>
                <label htmlFor="remitente">Remitente (opcional)</label>
                <input id="remitente" {...register('remitente')} maxLength={250} />
            </div>
            <div className={styles.campo}>
                <label htmlFor="observaciones">Observaciones (opcional)</label>
                <textarea id="observaciones" {...register('observaciones')} maxLength={20000} />
            </div>
            {!id&&opciones.puede_decidir_registro&&<div className={documentoStyles.decisionRegistro}><DecisionDireccionCampos valor={decision} onChange={setDecision} opciones={opciones} permitirPendiente prefijo="registro-"/></div>}
            {!id&&opciones.puede_delegar_personal&&<div className={documentoStyles.decisionRegistro}><label><input type="checkbox" checked={delegar} onChange={e=>setDelegar(e.target.checked)}/> Registrar delegación</label>{delegar&&<DelegacionPersonalCampos valor={personal} onChange={setPersonal} opciones={opciones}/>}</div>}
            {id && <div className={styles.campo}>
                <label htmlFor="motivo">Motivo de correccion</label>
                <textarea id="motivo" {...register('motivo')} required maxLength={1000} />
            </div>}
            {error && <p className={styles.error} role="alert">
                {error}
            </p>}
            <div className={styles.acciones}>
                <button className={styles.boton} disabled={isSubmitting}>
                    {isSubmitting ? 'Guardando...' : 'Guardar documento'}
                </button>
                <Link className={styles.secundario} to={id ? `/documentos/${id}` : origenId?`/documentos/${origenId}`:'/documentos'}>Cancelar</Link>
            </div>
        </form>}
    </section>;
}
