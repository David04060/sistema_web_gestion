import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import * as documentos from '../../documentos/api/documentos.api';
import * as api from '../api/ingresos.api';
import { presentacionSchema } from '../schemas/ingresos.schema';
import { fechaLocal } from '../../../lib/fechas';
import styles from '../../../components/ui/Admin.module.css';

/** Carga capacidades antes de consultar las tablas nuevas. Los demás perfiles no montan esta ruta. */
export function PrimerIngresoPage() {
    const { id } = useParams();
    const token = useAuth().sesion!.token;
    const consulta = useConsulta(useCallback(async () => {
        const opciones = await documentos.opciones(token);
        if (!opciones.primer_ingreso_ordinario_habilitado || !opciones.puede_ingresar_mesa)
            return { opciones, archivos: [], entrega: null };
        const [archivos, entrega] = await Promise.all([
            id ? Promise.resolve({ archivos: [] }) : documentos.archivosDisponibles(token),
            id ? api.recepcion(token, id) : Promise.resolve(null),
        ]);
        return { opciones, archivos: archivos.archivos, entrega: entrega?.entrega ?? null };
    }, [token, id]));
    return <main className={styles.pagina}>
        <h1>Primer ingreso ordinario</h1>
        <p>{id ? 'Presentación de un original entregado a Secretaría.' : 'Registro conjunto de un original externo y su primera presentación al trámite.'}</p>
        <EstadoCarga {...consulta} reintentar={consulta.recargar} />
        {consulta.datos && (!consulta.datos.opciones.primer_ingreso_ordinario_habilitado || !consulta.datos.opciones.puede_ingresar_mesa
            ? <p role="alert">El primer ingreso ordinario no está disponible para esta sesión.</p>
            : <Formulario key={id ?? 'externo'} token={token} id={id} datos={consulta.datos} />)}
        <Link to={id ? `/movimientos/${id}` : '/documentos'}>Volver {id ? 'a la entrega' : 'a documentos'}</Link>
    </main>;
}

function Formulario({ token, id, datos }: { token: string; id: string | undefined; datos: {
    opciones: Awaited<ReturnType<typeof documentos.opciones>>;
    archivos: Awaited<ReturnType<typeof documentos.archivosDisponibles>>['archivos'];
    entrega: Awaited<ReturnType<typeof api.recepcion>>['entrega'] | null;
} }) {
    const navigate = useNavigate();
    const [enviando, setEnviando] = useState(false), [error, setError] = useState('');
    const [solicitud] = useState(() => crypto.randomUUID());
    const ocupado = useRef(false), mensaje = useRef<HTMLParagraphElement>(null);
    const entrega = datos.entrega, pendiente = entrega?.estado === 'EN_TRASLADO';
    const accion = !id ? 'Registrar original externo e ingreso' : pendiente ? 'Recibir e ingresar a Mesa de Partes' : 'Formalizar primer ingreso de la recepción';
    if (!id && !datos.archivos.length) return <p role="alert">Necesita un archivo de recepción asignado a su nombre en Mesa de Partes. Solicite al Administrador su creación o asignación; no se creará automáticamente.</p>;
    return <>
        {entrega && <section className={styles.tarjeta}>
            <h2>Documento entregado · {entrega.codigo}</h2><p>{entrega.asunto}</p>
            <dl className={styles.datos}>
                <div><dt>Archivo de pertenencia</dt><dd>{entrega.archivo_nombre ?? 'Archivo institucional pendiente de clasificación'}</dd></div>
                <div><dt>Responsable vigente del archivo</dt><dd>{entrega.archivo_responsable || 'Pendiente de clasificación'}</dd></div>
                <div><dt>Registrador original</dt><dd>{entrega.registrador}</dd></div>
                <div><dt>Remitente registrado</dt><dd>{entrega.remitente || 'No registrado'}</dd></div>
                <div><dt>Custodio actual</dt><dd>{entrega.custodio} · {entrega.oficina_custodia}</dd></div>
                <div><dt>Ubicación confirmada</dt><dd>{pendiente ? 'Original en traslado; recepción pendiente' : entrega.ubicacion ?? 'Sin archivador registrado'}</dd></div>
                {entrega.fecha_recepcion && <div><dt>Recepción física confirmada</dt><dd>{fechaLocal(entrega.fecha_recepcion)}</dd></div>}
            </dl>
            <p>Se conservarán la identidad, el código, la autoría y el archivo de este original. {pendiente ? 'Recibir sin abrir un trámite sigue disponible en la pantalla de la entrega.' : 'La recepción ya ocurrió: formalizar el ingreso no vuelve a confirmar ese hecho físico ni cambia su ubicación.'}</p>
        </section>}
        <section className={styles.tarjeta}>
            <h2>{accion}</h2>
            {!id && <p>Utilice esta opción solo para un original externo todavía no registrado. Si el original ya existe, utilice su entrega real a Secretaría. La registradora será Secretaría; el remitente y el presentante son datos diferentes.</p>}
            <form onSubmit={async e => {
                e.preventDefault(); if (ocupado.current) return;
                const form = new FormData(e.currentTarget), campo = (nombre: string) => String(form.get(nombre) ?? '').trim();
                ocupado.current = true; setEnviando(true); setError('');
                try {
                    const fecha = campo('fecha_presentacion');
                    const validacion = presentacionSchema.safeParse({ presentante: campo('presentante'), procedencia: campo('procedencia'), proposito: campo('proposito'),
                        ...(fecha ? { fecha_presentacion: new Date(fecha).toISOString() } : {}) });
                    if (!validacion.success) throw new Error(validacion.error.issues[0]?.message ?? 'Revise los datos de presentación');
                    const presentacion = validacion.data;
                    const result = !id ? await api.registrarExterno(token, {
                        tipo_documental_id: campo('tipo_documental_id'), asunto: campo('asunto'), remitente: campo('remitente'),
                        observaciones: campo('observaciones') || null, archivador_id: campo('archivador_id') || null,
                        archivo_id: campo('archivo_id'), solicitud_id: solicitud, presentacion,
                    }) : pendiente ? await api.recibirEIngresar(token, id, { ...presentacion, archivador_id: campo('archivador_id') || null, confirmar_recepcion: true })
                        : await api.formalizarRecibido(token, id, presentacion);
                    navigate(`/documentos/${result.documento_id}`, { replace: true });
                } catch (e) {
                    setError(e instanceof Error ? e.message : 'No se pudo registrar el primer ingreso');
                    requestAnimationFrame(() => mensaje.current?.focus());
                } finally { ocupado.current = false; setEnviando(false); }
            }}>
                {!id && <>
                    <div className={styles.campo}><label htmlFor="archivo-recepcion">Archivo de recepción asignado</label>
                        <select id="archivo-recepcion" name="archivo_id" required><option value="">Seleccione el archivo apropiado</option>
                            {datos.archivos.map(a => <option key={a.id} value={a.id}>{a.nombre} · {a.responsabilidad}</option>)}
                        </select>
                    </div>
                    <div className={styles.campo}><label htmlFor="tipo-externo">Tipo documental</label><select id="tipo-externo" name="tipo_documental_id" required>
                        <option value="">Seleccione</option>{datos.opciones.tipos.filter(t => t.prefijo_codigo).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select></div>
                    <div className={styles.campo}><label htmlFor="asunto-externo">Asunto del documento</label><textarea id="asunto-externo" name="asunto" required maxLength={20000} /></div>
                    <div className={styles.campo}><label htmlFor="remitente-externo">Remitente del documento externo</label><input id="remitente-externo" name="remitente" required maxLength={250} /></div>
                    <div className={styles.campo}><label htmlFor="observaciones-externo">Observaciones del documento (opcional)</label><textarea id="observaciones-externo" name="observaciones" maxLength={20000} /></div>
                </>}
                <div className={styles.campo}><label htmlFor="presentante">Persona que presenta el original</label><input id="presentante" name="presentante" required maxLength={250} /></div>
                <div className={styles.campo}><label htmlFor="procedencia">Procedencia {id ? 'de la presentación' : 'externa'}</label><textarea id="procedencia" name="procedencia" required maxLength={2000} /></div>
                <div className={styles.campo}><label htmlFor="proposito">Propósito de la gestión</label><textarea id="proposito" name="proposito" required maxLength={20000} /></div>
                <div className={styles.campo}><label htmlFor="fecha-presentacion">Fecha de presentación (opcional)</label><input id="fecha-presentacion" name="fecha_presentacion" type="datetime-local" aria-describedby="ayuda-presentacion" />
                    <small id="ayuda-presentacion">Sin fecha indicada se usa la recepción física confirmada o, para un original externo, el momento del registro. No se admiten fechas futuras.</small></div>
                {(!id || pendiente) && <div className={styles.campo}><label htmlFor="ubicacion-ingreso">Archivador propio para la custodia inicial (opcional)</label>
                    <select id="ubicacion-ingreso" name="archivador_id"><option value="">Sin asignar</option>{datos.opciones.archivadores.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select>
                </div>}
                <p>El resultado será PENDIENTE_DECISION. Dirección autoriza después; la autorización no representa la salida física.</p>
                <div className={styles.campo}><label><input type="checkbox" required /> {pendiente ? 'Confirmo que he recibido físicamente el original y que debe ingresar al trámite.' : !id ? 'Confirmo que es un original externo no registrado y que se presenta a este trámite.' : 'Confirmo los datos de esta primera presentación al trámite.'}</label></div>
                {error && <p role="alert" tabIndex={-1} ref={mensaje} className={styles.error}>{error}</p>}
                <button className={styles.boton} disabled={enviando}>{enviando ? 'Confirmando…' : accion}</button>
            </form>
        </section>
    </>;
}
