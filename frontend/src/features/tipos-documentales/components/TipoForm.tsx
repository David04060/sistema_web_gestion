import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { formularioTipoSchema, type FormularioTipo, type TipoDocumental } from '../schemas/tipos.schema';
import type { z } from 'zod';
import styles from '../../../components/ui/Admin.module.css';
/** RHF conserva campos; Zod normaliza solo al enviar. Las reservas también se verifican en Express. */
export function TipoForm({ inicial, onGuardar }: {
    inicial?: TipoDocumental;
    onGuardar: (d: z.output<typeof formularioTipoSchema>) => Promise<void>;
}) {
    const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FormularioTipo>({ defaultValues: { nombre: inicial?.nombre ?? '', prefijo_codigo: inicial?.prefijo_codigo ?? '' } });
    const [error, setFallo] = useState('');
    const reservado = !!inicial && (inicial.requiere_clave || ['Informe', 'Oficio', 'Memorando', 'Acta', 'Comunicado', 'FUT'].includes(inicial.nombre));
    /** Valida nombre y prefijo, presenta errores por campo y delega el guardado; muestra el fallo de la API sin perder el formulario. */
    async function enviar(datos: FormularioTipo) {
        setFallo('');
        const v = formularioTipoSchema.safeParse(datos);
        if (!v.success) {
            v.error.issues.forEach(/** Asocia cada incidencia de Zod con el campo del tipo documental que debe corregirse. */  i => setError(i.path[0] as keyof FormularioTipo, { message: i.message }));
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
        {error && <p className={styles.error} role="alert">
            {error}
        </p>}
        {reservado && <p className={styles.aviso}>Tipo institucional reservado. Su nombre y prefijo se conservan.</p>}
        <div className={styles.campo}>
            <label htmlFor="nombre">Nombre</label>
            <input id="nombre" {...register('nombre')} readOnly={reservado} maxLength={120} />
            {errors.nombre && <p className={styles.error} role="alert">
                {errors.nombre.message}
            </p>}
        </div>
        <div className={styles.campo}>
            <label htmlFor="prefijo">Prefijo</label>
            <input id="prefijo" {...register('prefijo_codigo')} readOnly={reservado || inicial?.prefijo_protegido} maxLength={8} />
            <small>Opcional hasta su aprobación. Entre 2 y 8 letras; no se generan códigos aquí. Un prefijo utilizado queda protegido.</small>
            {errors.prefijo_codigo && <p className={styles.error} role="alert">
                {errors.prefijo_codigo.message}
            </p>}
        </div>
        <div className={styles.acciones}>
            {!reservado && <button className={styles.boton} disabled={isSubmitting}>
                {isSubmitting ? 'Guardando…' : 'Guardar tipo'}
            </button>}
            <Link className={styles.secundario} to={inicial ? `/tipos-documentales/${inicial.id}` : '/tipos-documentales'}>Volver</Link>
        </div>
    </form>;
}
