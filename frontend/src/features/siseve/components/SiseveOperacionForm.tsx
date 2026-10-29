import { useState } from 'react';
import siseveStyles from '../styles/Siseve.module.css';
import { useForm, useWatch } from 'react-hook-form';
import { solicitudSchema, type Solicitud } from '../schemas/siseve.schema';
import type { Resultado } from '../api/siseve.api';
import styles from '../../../components/ui/Admin.module.css';
export interface Preparacion {
    operacion: string;
    id: string;
    asunto?: string;
    remitente?: string | null;
    observaciones?: string | null;
    pagina?: number;
    revision: number;
}
interface Props {
    preparacion: Preparacion;
    operaciones: {
        id: string;
        nombre: string;
    }[];
    catalogos: Extract<Resultado, {
        tipos: unknown;
    }> | null;
    ocupado: boolean;
    destinoAutorizado: string | null;
    ejecutar: (datos: Solicitud,pdf?:File|null) => Promise<void>;
}
/** La contraseña se limpia antes de enviar; cada acción vuelve a exigir entrada explícita. */
export function SiseveOperacionForm({ preparacion: p, operaciones, catalogos, ocupado, destinoAutorizado, ejecutar }: Props) {
    const [pdf,setPdf]=useState<File|null>(null);
    const { register, handleSubmit, control, resetField, setError, formState: { errors } } = useForm<Solicitud>({ defaultValues: { operacion: p.operacion, clasificacion_registro: '', id: p.id, asunto: p.asunto ?? '', remitente: p.remitente ?? '', observaciones: p.observaciones ?? '', clave: '', archivador_id: '', usuario_destino_id: '', motivo: '', q: '', estado: '', pagina: String(p.pagina ?? 1), confirmado: false } });
    const operacion = useWatch({ control, name: 'operacion' });
    const consulta = ['listar', 'detalle', 'historial', 'opciones', 'movimientos', 'movimiento'].includes(operacion);
    const contenido = operacion === 'registrar' || operacion === 'corregir';
    const motivo = !consulta && operacion !== 'registrar' && operacion !== 'recibir';
    /**
     * Valida la solicitud y las confirmaciones necesarias; si son válidas, limpia la clave y la confirmación del formulario antes de ejecutar la operación.
     * @param datos - Datos de entrada según el contrato tipado de esta operación.
     */
    async function enviar(datos: Solicitud) {
        const r = solicitudSchema.safeParse(datos);
        if (!r.success) {
            setError('clave', { message: r.error.issues[0]?.message });
            return;
        }
        if (!consulta && !datos.confirmado) {
            setError('confirmado', { message: 'Confirme la operación seleccionada' });
            return;
        }
        resetField('clave');
        resetField('confirmado');
        await ejecutar(r.data,operacion==='registrar'?pdf:null);
        setPdf(null);
    }
    return <section className={styles.tarjeta}>
        <h2>Verificar y ejecutar una operación</h2>
        {operacion==='registrar'&&<label>PDF opcional (máximo 15 MB)<input type="file" accept="application/pdf,.pdf" disabled={ocupado} onChange={e=>setPdf(e.target.files?.[0]??null)}/></label>}
        <form className={siseveStyles.formulario} onSubmit={handleSubmit(enviar)} autoComplete="off">
            <div className={styles.datos}>
                <div className={styles.campo}>
                    <label htmlFor="s-operacion">Operación</label>
                    <select id="s-operacion" {...register('operacion')}>
                        {operaciones.map(/** Presenta una operación habilitada para preparar su solicitud independiente. */  o => <option key={o.id} value={o.id}>
                            {o.nombre}
                        </option>)}
                    </select>
                </div>
                {!['listar', 'opciones', 'registrar'].includes(operacion) && <div className={styles.campo}>
                    <label htmlFor="s-id">Identificador {['movimiento', 'recibir', 'rechazar', 'recuperar', 'cancelar'].includes(operacion) ? 'del movimiento' : 'del documento'}
                    </label>
                    <input id="s-id" {...register('id')} inputMode="numeric" pattern="[1-9][0-9]*" required={operacion !== 'movimientos'} />
                </div>}
                {(operacion === 'listar' || operacion === 'movimientos') && <>
                    <div className={styles.campo}>
                        <label htmlFor="s-buscar">Buscar código, asunto o remitente (documentos)</label>
                        <input id="s-buscar" {...register('q')} maxLength={250} />
                    </div>
                    <div className={styles.campo}>
                        <label htmlFor="s-estado">Estado</label>
                        <select id="s-estado" {...register('estado')}>
                            <option value="">Todos</option>
                            {(operacion === 'listar' ? ['PENDIENTE_DECISION', 'EN_TRASLADO', 'RECIBIDO', 'RECHAZADO', 'CANCELADO'] : ['EN_TRASLADO', 'RECIBIDO', 'RECHAZADO', 'CANCELADO']).map(/** Presenta únicamente estados admitidos por el tipo de consulta documental o de movimientos. */  e => <option key={e}>
                                {e}
                            </option>)}
                        </select>
                    </div>
                    <div className={styles.campo}>
                        <label htmlFor="s-pagina">Página</label>
                        <input id="s-pagina" type="number" min={1} max={1000000} {...register('pagina')} />
                    </div>
                </>}
                {operacion === 'salir' && destinoAutorizado && <p>La salida utilizará exclusivamente el destinatario autorizado: {catalogos?.destinatarios.find(/** Busca el destinatario previamente autorizado para informar la salida restringida. */  u => u.id === destinoAutorizado)?.nombre ?? `Cuenta ${destinoAutorizado}`}
                </p>}
                {operacion === 'registrar' && <div className={styles.campo}><label htmlFor="s-clasificacion">Clasificación del registro</label><select id="s-clasificacion" required {...register('clasificacion_registro')}><option value="">Seleccione</option><option value="RECIBIDO">Recibido</option><option value="EMITIDO">Emitido</option></select></div>}
                {contenido && <>
                    <div className={styles.campo}>
                        <label htmlFor="s-asunto">Asunto</label>
                        <textarea id="s-asunto" required maxLength={20000} {...register('asunto')} />
                    </div>
                    <div className={styles.campo}>
                        <label htmlFor="s-remitente">Remitente (opcional)</label>
                        <input id="s-remitente" maxLength={250} {...register('remitente')} />
                    </div>
                    <div className={styles.campo}>
                        <label htmlFor="s-observaciones">Observaciones (opcional)</label>
                        <textarea id="s-observaciones" maxLength={20000} {...register('observaciones')} />
                    </div>
                </>}
                {['autorizar', 'salir'].includes(operacion) && !(operacion === 'salir' && destinoAutorizado) && <div className={styles.campo}>
                    <label htmlFor="s-destino">Destinatario</label>
                    <select id="s-destino" required {...register('usuario_destino_id')}>
                        <option value="">Seleccione; consulte primero las opciones si no aparecen destinos</option>
                        {catalogos?.destinatarios.map(/** Presenta un destinatario autorizado recuperado mediante una operación protegida previa. */  u => <option key={u.id} value={u.id}>
                            {u.nombre} · {u.oficina}
                        </option>)}
                    </select>
                </div>}
                {['registrar', 'recibir', 'recuperar', 'cancelar'].includes(operacion) && <div className={styles.campo}>
                    <label htmlFor="s-archivo">Archivador propio (opcional)</label>
                    <select id="s-archivo" {...register('archivador_id')}>
                        <option value="">Sin asignar</option>
                        {catalogos?.archivadores.map(/** Presenta un archivador propio obtenido por consulta protegida. */  a => <option key={a.id} value={a.id}>
                            {a.nombre}
                        </option>)}
                    </select>
                </div>}
                {motivo && <div className={styles.campo}>
                    <label htmlFor="s-motivo">Motivo obligatorio</label>
                    <textarea id="s-motivo" required maxLength={1000} {...register('motivo')} />
                </div>}
                <div className={styles.campo}>
                    <label htmlFor="s-clave">Contraseña adicional para esta operación</label>
                    <input id="s-clave" type="password" autoComplete="off" required maxLength={1024} {...register('clave')} />
                    {errors.clave && <p role="alert">
                        {errors.clave.message}
                    </p>}
                </div>
            </div>
            {!consulta && <>
                <label>
                    <input type="checkbox" {...register('confirmado')} /> Confirmo la operación. Para salida, recepción o recuperación, confirmo el hecho físico correspondiente.</label>
                {errors.confirmado && <p role="alert">
                    {errors.confirmado.message}
                </p>}
            </>}
            <p>La contraseña no se conserva. Consultar opciones, abrir un detalle y registrar una modificación son operaciones independientes y requieren ingresarla nuevamente.</p>
            <button className={styles.boton} disabled={ocupado}>
                {ocupado ? 'Verificando...' : 'Verificar y ejecutar'}
            </button>
        </form>
    </section>;
}
