import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { estanteDatosSchema, type Estante, type Opciones, type DatosEstante } from '../schemas/ubicaciones.schema';
import styles from '../../../components/ui/Admin.module.css';
/** La oficina se fija al crear; reasignar responsabilidad mantiene IDs y archivadores. */
export function EstanteForm({ inicial, opciones, onGuardar }: {
    inicial?: Estante;
    opciones: Opciones;
    onGuardar: (d: DatosEstante) => Promise<void>;
}) {
    const { register, watch, setError, handleSubmit, formState: { errors, isSubmitting } } = useForm<DatosEstante>({ defaultValues: { codigo: inicial?.codigo ?? '', oficina_id: inicial?.oficina_id ?? opciones.oficina_id ?? '', usuario_id: inicial?.usuario_id ?? (opciones.administrador ? '' : opciones.actor_id) } });
    const oficina = watch('oficina_id');
    const [error, setFallo] = useState('');
    const oficinas = opciones.oficinas.some(/** Comprueba si las opciones ya incluyen la oficina histórica del estante. */  o => o.id === inicial?.oficina_id) ? opciones.oficinas : inicial ? [...opciones.oficinas, { id: inicial.oficina_id, nombre: inicial.oficina }] : opciones.oficinas;
    /** Valida el código y las asignaciones; delega el guardado y presenta errores sin cambiar la oficina histórica. */
    async function enviar(d: DatosEstante) {
        setFallo('');
        const v = estanteDatosSchema.safeParse(d);
        if (!v.success) {
            v.error.issues.forEach(/** Asigna la incidencia de validación al campo del estante correspondiente. */  i => setError(i.path[0] as keyof DatosEstante, { message: i.message }));
            return;
        }
        try {
            await onGuardar(v.data);
        }
        catch (e) {
            setFallo(e instanceof Error ? e.message : 'No se pudo guardar');
        }
    }

    return <form onSubmit={handleSubmit(enviar)}>
        {error && <p role="alert" className={styles.error}>
            {error}
        </p>}
        <div className={styles.campo}>
            <label htmlFor="codigo">Código de estante</label>
            <input id="codigo" maxLength={10} {...register('codigo')} />
            <small>El esquema actual admite de 1 a 10 letras mayúsculas.</small>
            {errors.codigo && <p className={styles.error} role="alert">
                {errors.codigo.message}
            </p>}
        </div>
        <div className={styles.campo}>
            <label htmlFor="oficina">Oficina institucional</label>
            <select id="oficina" {...register('oficina_id')} disabled={!!inicial || !opciones.administrador}>
                <option value="">Selecciona una oficina</option>
                {oficinas.map(/** Presenta una oficina permitida conservando su ID. */  o => <option key={o.id} value={o.id}>
                    {o.nombre}
                </option>)}
            </select>
            {errors.oficina_id && <p className={styles.error} role="alert">Selecciona la oficina</p>}
            <small>La oficina se conserva aunque cambie la cuenta responsable.</small>
        </div>
        {opciones.administrador ? <div className={styles.campo}>
            <label htmlFor="responsable">Responsable</label>
            <select id="responsable" {...register('usuario_id')}>
                <option value="">Selecciona un responsable</option>
                {opciones.responsables.filter(/** Permite responsables activos de la oficina o conservar el responsable histórico del estante. */  u => (u.activo && u.oficina_id === oficina) || u.id === inicial?.usuario_id).map(/** Presenta el responsable e identifica las cuentas históricas inactivas. */  u => <option key={u.id} value={u.id}>
                    {u.nombre}
                    {!u.activo ? ' (inactivo)' : ''}
                </option>)}
            </select>
            {errors.usuario_id && <p className={styles.error} role="alert">Selecciona el responsable</p>}
            <small>Reasignar conserva el estante y su historial; requiere una cuenta activa de la misma oficina.</small>
        </div> : <p>Responsable: {inicial?.responsable ?? 'Tu cuenta autenticada'}
        </p>}
        <div className={styles.acciones}>
            <button className={styles.boton} disabled={isSubmitting}>
                {isSubmitting ? 'Guardando…' : 'Guardar estante'}
            </button>
            <Link className={styles.secundario} to={inicial ? `/ubicaciones/estantes/${inicial.id}` : '/ubicaciones'}>Cancelar</Link>
        </div>
    </form>;
}
