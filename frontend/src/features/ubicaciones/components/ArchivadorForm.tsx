import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { archivadorDatosSchema, type Estante, type Archivador, type DatosArchivador } from '../schemas/ubicaciones.schema';
import styles from '../../../components/ui/Admin.module.css';
/** Cambia únicamente el número del archivador existente; el padre se conserva. */
export function ArchivadorForm({ inicial, estantes, onGuardar }: {
    inicial?: Archivador;
    estantes: Estante[];
    onGuardar: (d: DatosArchivador) => Promise<void>;
}) {
    const { register, setError, handleSubmit, formState: { errors, isSubmitting } } = useForm<DatosArchivador>({ defaultValues: { estante_id: inicial?.estante_id ?? '', numero: inicial?.numero ?? 1 } });
    const [error, setFallo] = useState('');
    /** Valida estante y número, delega el guardado y presenta el fallo sin trasladar el archivador. */
    async function enviar(d: DatosArchivador) {
        setFallo('');
        const v = archivadorDatosSchema.safeParse(d);
        if (!v.success) {
            v.error.issues.forEach(/** Asigna cada incidencia al campo del archivador que debe corregirse. */  i => setError(i.path[0] as keyof DatosArchivador, { message: i.message }));
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
            <label htmlFor="estante">Estante</label>
            <select id="estante" {...register('estante_id')} disabled={!!inicial}>
                <option value="">Selecciona el estante</option>
                {estantes.map(/** Presenta un estante disponible con su oficina y responsable. */  e => <option key={e.id} value={e.id}>
                    {e.oficina} · {e.codigo} · {e.responsable}
                </option>)}
            </select>
            {errors.estante_id && <p className={styles.error} role="alert">Selecciona el estante</p>}
        </div>
        <div className={styles.campo}>
            <label htmlFor="numero">Número de archivador</label>
            <input id="numero" type="number" min="1" max="2147483647" {...register('numero', { valueAsNumber: true })} />
            {errors.numero && <p className={styles.error} role="alert">
                {errors.numero.message}
            </p>}
        </div>
        <div className={styles.acciones}>
            <button className={styles.boton} disabled={isSubmitting}>
                {isSubmitting ? 'Guardando…' : 'Guardar archivador'}
            </button>
            <Link className={styles.secundario} to={inicial ? `/ubicaciones/archivadores/${inicial.id}` : '/ubicaciones'}>Cancelar</Link>
        </div>
    </form>;
}
