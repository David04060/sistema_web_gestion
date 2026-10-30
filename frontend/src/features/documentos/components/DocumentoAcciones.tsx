import documentoStyles from '../styles/Documentos.module.css';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useConsulta } from '../../../hooks/useConsulta';
import * as api from '../api/documentos.api';
import * as movimientos from '../../movimientos/api/movimientos.api';
import type { detalleDocumentoSchema } from '../schemas/documentos.schema';
import styles from '../../../components/ui/Admin.module.css';
const accionSchema = z.object({ accion: z.enum(['autorizar', 'retirar-autorizacion', 'anular', 'solicitar-decision', 'salir']), usuario_destino_id: z.string(), motivo: z.string().trim().min(1, 'El motivo es obligatorio').max(1000), confirmado: z.boolean().refine(Boolean, 'Confirme la operacion fisica o administrativa') });
type Datos = z.infer<typeof accionSchema>;
/** Presenta unicamente acciones concedidas por el backend; este vuelve a autorizarlas al escribir. */
export function DocumentoAcciones({ documento: d, token, actualizar }: {
    documento: z.infer<typeof detalleDocumentoSchema>['documento'];
    token: string;
    actualizar: (mensaje: string) => void;
}) {
    const opciones = useConsulta(useCallback(/** Consulta opciones permitidas para la operación documental. */() => api.opciones(token), [token]));
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<Datos>({ defaultValues: { accion: d.permisos.autorizar ? 'autorizar' : d.permisos.salir ? 'salir' : d.permisos.solicitar_decision ? 'solicitar-decision' : 'anular', usuario_destino_id: d.destinatario_autorizado_id ?? '', motivo: '', confirmado: false } });
    const acciones = [...(d.permisos.autorizar ? [{ valor: 'autorizar', nombre: 'Autorizar derivacion' }, ...(d.destinatario_autorizado_id ? [{ valor: 'retirar-autorizacion', nombre: 'Retirar autorizacion' }] : [])] : []), ...(d.permisos.salir ? [{ valor: 'salir', nombre: 'Confirmar salida fisica' }] : []), ...(d.permisos.solicitar_decision ? [{ valor: 'solicitar-decision', nombre: 'Solicitar decision de Direccion' }] : []), ...(d.permisos.anular ? [{ valor: 'anular', nombre: 'Anular registro documental' }] : [])];
    /**
     * Valida motivo y confirmación; delega la salida física a Movimientos o ejecuta la decisión documental y recarga el detalle autorizado.
     * @param datos - Datos de entrada según el contrato tipado de esta operación.
     */
    async function ejecutar(datos: Datos) {
        setError('');
        const v = accionSchema.safeParse(datos);
        if (!v.success) {
            setError(v.error.issues[0]?.message ?? 'Revise los datos');
            return;
        }
        try {
            if (datos.accion === 'salir') {
                const r = await movimientos.derivar(token, { documento_id: d.id, usuario_destino_id: d.destinatario_autorizado_id ?? datos.usuario_destino_id, motivo: datos.motivo });
                navigate(`/movimientos/${r.movimiento.id}`);
                return;
            }
            await api.operar(token, d.id, datos.accion, datos.accion === 'autorizar' ? { usuario_destino_id: datos.usuario_destino_id, motivo: datos.motivo } : { motivo: datos.motivo });
            reset();
            actualizar('Operacion registrada en el historial.');
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo completar');
        }
    }
    return <section className={`${styles.tarjeta} ${documentoStyles.panelAcciones}`}>
        <h2>Operaciones autorizadas</h2>
        <EstadoCarga {...opciones} reintentar={opciones.recargar} />
        {d.destinatario_autorizado_id && <p>Destino autorizado: {opciones.datos?.destinatarios.find(/** Busca el nombre del destinatario autorizado sin alterar el destino seleccionado por Dirección. */  u => u.id === d.destinatario_autorizado_id)?.nombre ?? `Cuenta ${d.destinatario_autorizado_id}`} · {opciones.datos?.destinatarios.find(/** Busca la oficina del destinatario autorizado para presentar la decisión. */  u => u.id === d.destinatario_autorizado_id)?.oficina ?? `Oficina ${d.oficina_destino_autorizada_id}`}
        </p>}
        {d.estado_tramite === 'PENDIENTE_DECISION' && <p>
            {d.destinatario_autorizado_id ? 'Derivacion autorizada: espera la salida fisica.' : 'Espera una decision de Direccion.'}
        </p>}
        {acciones.length > 0 ? <form className={documentoStyles.formularioAccion} onSubmit={handleSubmit(ejecutar)}>
            <div className={styles.campo}>
                <label htmlFor="operacion">Operacion</label>
                <select id="operacion" {...register('accion')} defaultValue={acciones[0]?.valor}>
                    {acciones.map(/** Presenta una operación concedida por el backend como opción del formulario. */  a => <option key={a.valor} value={a.valor}>
                        {a.nombre}
                    </option>)}
                </select>
            </div>
            {(d.permisos.autorizar || (d.permisos.salir && !d.destinatario_autorizado_id)) && <div className={styles.campo}>
                <label htmlFor="destino">Destinatario (para autorizacion o salida)</label>
                <select id="destino" {...register('usuario_destino_id')}>
                    <option value="">Seleccione</option>
                    {opciones.datos?.destinatarios.filter(/** Excluye al custodio actual de la selección de destinatarios de salida. */  u => u.id !== d.responsable_actual_id).map(/** Presenta el destinatario y su oficina conservando su ID textual. */  u => <option key={u.id} value={u.id}>
                        {u.nombre} · {u.oficina}
                    </option>)}
                </select>
                {d.destinatario_autorizado_id && <p>La salida utilizara exclusivamente el destino ya autorizado.</p>}
            </div>}
            <div className={styles.campo}>
                <label htmlFor="razon">Motivo</label>
                <textarea id="razon" {...register('motivo')} required maxLength={1000} />
            </div>
            <label>
                <input type="checkbox" {...register('confirmado')} /> Confirmo la operacion seleccionada. Si es una salida, confirmo que traslado fisicamente el original.</label>
            <p>La anulacion conserva el registro y su historial. Retirar una autorizacion no anula el documento.</p>
            {error && <p role="alert" className={styles.error}>
                {error}
            </p>}
            <button className={styles.boton} disabled={isSubmitting || opciones.cargando || !!opciones.error}>Confirmar operacion</button>
        </form> : <p>No hay operaciones disponibles bajo su custodia actual.</p>}
    </section>;
}
