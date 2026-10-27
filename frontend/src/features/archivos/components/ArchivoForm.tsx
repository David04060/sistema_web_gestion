import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import type { RegistroCatalogo } from '../../../lib/catalogo.schema';
import type { UsuarioAdministrado } from '../../usuarios/schemas/usuarios.schema';
import { responsableCompatible } from '../hooks/useCatalogosArchivos';
import { crearSchema, metadatosSchema, type Archivo, type Crear, type Metadatos } from '../schemas/archivos.schema';
import base from '../../../components/ui/Admin.module.css';
import styles from '../styles/Archivos.module.css';

/** Conserva datos ante errores; las referencias solo se seleccionan al crear. */
export function ArchivoForm({ inicial, oficinas, usuarios, ocupado, error, guardar }: {
    inicial?: Archivo; oficinas: RegistroCatalogo[]; usuarios: UsuarioAdministrado[];
    ocupado: boolean; error: string; guardar: (datos: Crear | Metadatos) => Promise<void>;
}) {
    const { register, handleSubmit, watch, setValue, setError, clearErrors, setFocus, formState: { errors } } = useForm<Crear>({
        defaultValues: { nombre: inicial?.nombre ?? '', responsabilidad: inicial?.responsabilidad ?? '', motivo: '',
            oficina_id: inicial?.oficina_id ?? '', responsable_id: inicial?.responsable_id ?? '' },
    });
    const errorRef = useRef<HTMLParagraphElement>(null);
    useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
    const oficina = oficinas.find(o => o.id === watch('oficina_id'));
    const compatibles = usuarios.filter(u => responsableCompatible(u, oficina));
    const responsable = watch('responsable_id');
    const incompatible = !inicial && !!responsable && !compatibles.some(u => u.id === responsable);
    useEffect(() => { if (incompatible) setValue('responsable_id', ''); }, [incompatible, setValue]);
    const oficinaRegistro = register('oficina_id');
    /** Valida con Zod y dirige el foco al primer campo incorrecto. */
    async function enviar(valores: Crear) {
        clearErrors();
        const meta = { nombre: valores.nombre, responsabilidad: valores.responsabilidad, motivo: valores.motivo };
        const result = inicial ? metadatosSchema.safeParse(meta) : crearSchema.safeParse(valores);
        if (!result.success) {
            let primero: keyof Crear | undefined;
            for (const issue of result.error.issues) {
                const campo = issue.path[0] as keyof Crear;
                setError(campo, { message: campo === 'oficina_id' ? 'Selecciona una oficina.' : campo === 'responsable_id' ? 'Selecciona un responsable compatible.' : issue.message });
                primero ??= campo;
            }
            if (primero) setFocus(primero);
            return;
        }
        if (!inicial && !compatibles.some(u => u.id === valores.responsable_id)) {
            setError('responsable_id', { message: 'Selecciona un responsable activo de esta oficina.' }, { shouldFocus: true });
            return;
        }
        await guardar(result.data);
    }
    return <form noValidate onSubmit={handleSubmit(enviar)} aria-busy={ocupado}>
        <fieldset disabled={ocupado}><div className={styles.rejilla}>
            <div className={`${base.campo} ${styles.amplio}`}><label htmlFor="archivo-nombre">Nombre del archivo</label>
                <input id="archivo-nombre" autoComplete="off" maxLength={150} {...register('nombre')} aria-invalid={!!errors.nombre} aria-describedby={errors.nombre ? 'archivo-error-nombre' : undefined} />
                {errors.nombre && <p id="archivo-error-nombre" className={base.error}>{errors.nombre.message}</p>}
            </div>
            <div className={`${base.campo} ${styles.amplio}`}><label htmlFor="archivo-responsabilidad">Responsabilidad o finalidad</label>
                <textarea id="archivo-responsabilidad" maxLength={20000} {...register('responsabilidad')} aria-invalid={!!errors.responsabilidad} aria-describedby={errors.responsabilidad ? 'archivo-error-responsabilidad' : undefined} />
                {errors.responsabilidad && <p id="archivo-error-responsabilidad" className={base.error}>{errors.responsabilidad.message}</p>}
            </div>
            {inicial ? <div className={`${styles.amplio} ${styles.aviso}`}><p><strong>Oficina:</strong> {inicial.oficina}</p><p><strong>Responsable vigente:</strong> {inicial.responsable}</p><p>Esta corrección conserva la oficina y la asignación del responsable.</p></div> : <>
                <div className={base.campo}><label htmlFor="archivo-oficina">Oficina</label>
                    <select id="archivo-oficina" {...oficinaRegistro} onChange={e => { void oficinaRegistro.onChange(e); setValue('responsable_id', ''); }} aria-invalid={!!errors.oficina_id} aria-describedby={errors.oficina_id ? 'archivo-error-oficina' : undefined}>
                        <option value="">Selecciona una oficina</option>{oficinas.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                    </select>{errors.oficina_id && <p id="archivo-error-oficina" className={base.error}>{errors.oficina_id.message}</p>}
                </div>
                <div className={base.campo}><label htmlFor="archivo-responsable">Responsable inicial</label>
                    <select id="archivo-responsable" {...register('responsable_id')} disabled={!oficina} aria-invalid={!!errors.responsable_id} aria-describedby="archivo-ayuda-responsable">
                        <option value="">Selecciona un responsable</option>{compatibles.map(u => <option key={u.id} value={u.id}>{u.nombre} {u.apellido} · {u.nombre_usuario}</option>)}
                    </select><small id="archivo-ayuda-responsable">{!oficina ? 'Selecciona primero la oficina.' : compatibles.length ? 'Solo se muestran cuentas activas compatibles con la oficina.' : 'Esta oficina no tiene responsables activos compatibles.'}</small>
                    {errors.responsable_id && <p className={base.error} role="alert">{errors.responsable_id.message}</p>}
                </div>
            </>}
            <div className={`${base.campo} ${styles.amplio}`}><label htmlFor="archivo-motivo">{inicial ? 'Motivo de la corrección' : 'Motivo del registro'}</label>
                <textarea id="archivo-motivo" maxLength={1000} {...register('motivo')} aria-invalid={!!errors.motivo} aria-describedby={errors.motivo ? 'archivo-error-motivo' : undefined} />
                {errors.motivo && <p id="archivo-error-motivo" className={base.error}>{errors.motivo.message}</p>}
            </div>
        </div></fieldset>
        {error && <p ref={errorRef} tabIndex={-1} role="alert" className={base.error}>{error}</p>}
        <div className={base.acciones}><button className={base.boton} disabled={ocupado}>{ocupado ? 'Guardando…' : inicial ? 'Guardar corrección' : 'Crear archivo institucional'}</button>
            {!ocupado && <Link className={base.secundario} to={inicial ? `/archivos/${inicial.id}` : '/archivos'}>Cancelar</Link>}</div>
    </form>;
}
