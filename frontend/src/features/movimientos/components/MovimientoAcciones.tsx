import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import * as documentos from '../../documentos/api/documentos.api';
import * as api from '../api/movimientos.api';
import { movimientoSchema } from '../schemas/movimientos.schema';
import styles from '../../../components/ui/Admin.module.css';
const esquema = z.object({ accion: z.enum(['recibir', 'rechazar', 'recuperar', 'cancelar']), archivador_id: z.string(), motivo: z.string().trim().max(1000), confirmado: z.boolean().refine(Boolean, 'Confirme la operacion fisica') });
type Datos = z.infer<typeof esquema>;
/** Una confirmacion representa un hecho fisico; nunca se transfiere custodia al rechazar. */
export function MovimientoAcciones({ movimiento: m, actualizar }: {
    movimiento: z.infer<typeof movimientoSchema>;
    actualizar: (mensaje: string) => void;
}) {
    const sesion = useAuth().sesion!;
    const opciones = useConsulta(useCallback(/** Consulta archivadores propios y opciones necesarias para confirmar el hecho físico. */() => documentos.opciones(sesion.token), [sesion.token]));
    const [error, setError] = useState('');
    const destino = m.usuario_destino_id === sesion.usuario.id;
    const origen = m.usuario_origen_id === sesion.usuario.id;
    const acciones = [...(destino && m.estado === 'EN_TRASLADO' ? [{ valor: 'recibir', nombre: 'Confirmar recepcion fisica' }, { valor: 'rechazar', nombre: 'Rechazar recepcion con motivo' }] : []), ...(origen && m.estado === 'EN_TRASLADO' ? [{ valor: 'cancelar', nombre: 'Cancelar traslado y confirmar recuperacion fisica' }] : []), ...(origen && m.estado === 'RECHAZADO' && !m.devolucion_confirmada_por_id ? [{ valor: 'recuperar', nombre: 'Confirmar recuperacion fisica en origen' }] : [])];
    const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<Datos>({ defaultValues: { accion: acciones[0]?.valor as Datos['accion'], archivador_id: '', motivo: '', confirmado: false } });
    /**
     * Valida la confirmación física y el motivo cuando corresponde; adapta el cuerpo a recepción, rechazo, recuperación o cancelación y actualiza el detalle confirmado.
     * @param datos - Datos de entrada según el contrato tipado de esta operación.
     */
    async function ejecutar(datos: Datos) {
        setError('');
        const v = esquema.safeParse(datos);
        if (!v.success) {
            setError(v.error.issues[0]?.message ?? 'Revise los datos');
            return;
        }
        if (datos.accion !== 'recibir' && !datos.motivo) {
            setError('El motivo es obligatorio');
            return;
        }
        const cuerpo = datos.accion === 'recibir' ? { archivador_id: datos.archivador_id || null } : datos.accion === 'rechazar' ? { motivo: datos.motivo } : { archivador_id: datos.archivador_id || null, motivo: datos.motivo, confirmar_recuperacion: true };
        try {
            await api.operar(sesion.token, m.id, datos.accion, cuerpo);
            reset();
            actualizar('Operacion fisica registrada.');
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo completar');
        }
    }
    if (!acciones.length)
        return null;
    return <section className={styles.tarjeta}>
        <h2>Confirmar operacion fisica</h2>
        <EstadoCarga {...opciones} reintentar={opciones.recargar} />
        <form onSubmit={handleSubmit(ejecutar)}>
            <div className={styles.campo}>
                <label htmlFor="accion-mov">Operacion</label>
                <select id="accion-mov" {...register('accion')}>
                    {acciones.map(/** Presenta una acción física disponible según actor y estado del movimiento. */  a => <option key={a.valor} value={a.valor}>
                        {a.nombre}
                    </option>)}
                </select>
            </div>
            <div className={styles.campo}>
                <label htmlFor="archivo-mov">Archivador propio al recibir o recuperar (opcional)</label>
                <select id="archivo-mov" {...register('archivador_id')}>
                    <option value="">Sin asignar</option>
                    {opciones.datos?.archivadores.map(/** Presenta un archivador autorizado para recepción o recuperación. */  a => <option key={a.id} value={a.id}>
                        {a.nombre}
                    </option>)}
                </select>
            </div>
            <div className={styles.campo}>
                <label htmlFor="motivo-mov">Motivo (obligatorio para rechazo, recuperacion o cancelacion)</label>
                <textarea id="motivo-mov" {...register('motivo')} maxLength={1000} />
            </div>
            <label>
                <input type="checkbox" {...register('confirmado')} /> Confirmo que la operacion fisica seleccionada ha ocurrido.</label>
            <p>Rechazar no transfiere la custodia. Cancelar requiere tener nuevamente el original en origen.</p>
            {error && <p className={styles.error} role="alert">
                {error}
            </p>}
            <button className={styles.boton} disabled={isSubmitting || opciones.cargando || !!opciones.error}>Registrar confirmacion</button>
        </form>
    </section>;
}
