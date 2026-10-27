import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
    const token = useAuth().sesion!.token;
    const consulta = useConsulta(useCallback(/** Carga opciones y, cuando corresponde, el detalle del documento que se corrige. */ async () => {
        const opciones = await api.opciones(token);
        const archivos = !id && opciones.vinculacion_archivos_habilitada ? (await api.archivosDisponibles(token)).archivos : [];
        return { opciones: { ...opciones, disponibles: archivos }, detalle: id ? await api.detalle(token, id) : null };
    }, [token, id]));
    return <main className={styles.pagina}>
        <h1>
            {id ? 'Corregir documento' : 'Registrar documento fisico'}
        </h1>
        <EstadoCarga {...consulta} reintentar={consulta.recargar} />
        {consulta.datos && (id && !consulta.datos.detalle?.documento.permisos.editar ? <p role="alert">No tiene permiso para corregir este documento en su estado actual.</p> : <Formulario key={id ?? 'nuevo'} token={token} id={id} inicial={consulta.datos.detalle?.documento} opciones={consulta.datos.opciones} />)}
    </main>;
}
/**
 * Mantiene el formulario de contenido documental separado de la consulta inicial; en corrección exige motivo y conserva los campos no editables.
 * @param props - Propiedades tipadas del componente, con datos y callbacks de su pantalla.
 */
function Formulario({ token, id, inicial, opciones }: {
    token: string;
    id: string | undefined;
    inicial: Documento | undefined;
    opciones: Awaited<ReturnType<typeof api.opciones>> & { disponibles: Awaited<ReturnType<typeof api.archivosDisponibles>>['archivos'] };
}) {
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const { register, handleSubmit, formState: { isSubmitting } } = useForm<FormularioDocumento>({ defaultValues: { archivo_id: '', tipo_documental_id: inicial?.tipo_documental_id ?? '', asunto: inicial?.asunto ?? '', remitente: inicial?.remitente ?? '', observaciones: inicial?.observaciones ?? '', archivador_id: inicial?.archivador_id ?? '', motivo: '' } });
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
        if (!id && opciones.vinculacion_archivos_habilitada && !valores.archivo_id) {
            setError('Seleccione un archivo institucional asignado a su nombre');
            return;
        }
        const contenido = { asunto: valores.asunto, remitente: valores.remitente || null, observaciones: valores.observaciones || null };
        try {
            const r = await api.guardar(token, id, id ? { ...contenido, motivo: valores.motivo, version_documental: inicial?.version_documental } : { ...contenido, tipo_documental_id: valores.tipo_documental_id, archivador_id: valores.archivador_id || null, ...(opciones.vinculacion_archivos_habilitada ? { archivo_id: valores.archivo_id } : {}) });
            navigate(`/documentos/${r.documento.id}`, { replace: true });
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo guardar');
        }
    }
    return <section className={styles.tarjeta}>
        <p>El codigo, la fecha y la autoria se asignan automaticamente. El original permanece bajo su custodia hasta confirmar una entrega.</p>
        {!id && opciones.vinculacion_archivos_habilitada && <p>El archivo conserva su identidad aunque cambie el trabajador. RECIBIDO representa aquí la custodia inicial registrada; no una recepción entre oficinas. No se crea ingreso de Mesa de Partes ni traslado físico.</p>}
        {!id && opciones.vinculacion_archivos_habilitada && !opciones.disponibles.length ? <p role="alert">No tiene un archivo institucional asignado. Solicite su asignación al Administrador para registrar documentos.</p> : !id && !opciones.puede_registrar ? <p role="alert">Necesita una oficina asignada para registrar documentos.</p> : <form onSubmit={handleSubmit(guardar)}>
            {!id && opciones.vinculacion_archivos_habilitada && <div className={styles.campo}>
                <label htmlFor="archivo-institucional">Archivo institucional</label>
                <select id="archivo-institucional" {...register('archivo_id')} required>
                    <option value="">Seleccione su archivo</option>
                    {opciones.disponibles.map(a => <option key={a.id} value={a.id}>{a.nombre} · {a.oficina}</option>)}
                </select>
            </div>}
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
            {!id && <div className={styles.campo}>
                <label htmlFor="archivo">Archivador propio (opcional)</label>
                <select id="archivo" {...register('archivador_id')}>
                    <option value="">Sin asignar</option>
                    {opciones.archivadores.map(/** Presenta un archivador autorizado para ubicar el original. */  a => <option key={a.id} value={a.id}>
                        {a.nombre}
                    </option>)}
                </select>
            </div>}
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
                <Link className={styles.secundario} to={id ? `/documentos/${id}` : '/documentos'}>Cancelar</Link>
            </div>
        </form>}
    </section>;
}
