import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { crearUsuarioSchema, datosUsuarioSchema, type CrearUsuario, type DatosUsuario, type UsuarioAdministrado } from '../schemas/usuarios.schema';
import type { RegistroCatalogo } from '../../../lib/catalogo.schema';
import styles from '../../../components/ui/Admin.module.css';
interface Valores {
    nombre: string;
    apellido: string;
    nombre_usuario: string;
    email: string;
    telefono: string;
    rol_id: string;
    oficina_id: string;
    contrasena: string;
    activo: boolean;
}
/** Formulario personal/de asignación; delega la escritura a la página y su API. */
export function UsuarioForm({ inicial, roles, oficinas, ocupado, error, onGuardar }: {
    inicial?: UsuarioAdministrado;
    roles: RegistroCatalogo[];
    oficinas: RegistroCatalogo[];
    ocupado: boolean;
    error: string;
    onGuardar: (datos: DatosUsuario | CrearUsuario) => Promise<void>;
}) {
    const { register, handleSubmit, watch, setValue, setError, formState: { errors } } = useForm<Valores>({
        defaultValues: {
            nombre: inicial?.nombre ?? '', apellido: inicial?.apellido ?? '', nombre_usuario: inicial?.nombre_usuario ?? '',
            email: inicial?.email ?? '', telefono: inicial?.telefono ?? '', rol_id: inicial?.rol_id ?? '',
            oficina_id: inicial?.oficina_id ?? '', contrasena: '', activo: inicial?.activo ?? true,
        }
    });
    const rol = roles.find(/** Localiza el rol seleccionado para aplicar sus restricciones institucionales de oficina. */  registro => registro.id === watch('rol_id'));
    const oficinaObligatoria = rol?.nombre === 'Director(a)' ? 'Dirección' : rol?.nombre === 'Secretaria de Dirección' ? 'Mesa de Partes' : null;
    useEffect(/** Sincroniza la oficina obligatoria al elegir Dirección o Secretaría de Dirección. */() => {
        if (oficinaObligatoria)
            setValue('oficina_id', oficinas.find(/** Busca el ID de la oficina exigida por el rol institucional. */  oficina => oficina.nombre === oficinaObligatoria)?.id ?? '');
    }, [oficinaObligatoria, oficinas, setValue]);
    /**
     * Valida datos personales o creación según el modo; asigna errores a sus campos, exige oficina fuera de Administración y delega únicamente datos válidos.
     * @param valores - Campos del formulario antes de normalizar y validar.
     */
    async function enviar(valores: Valores) {
        const { contrasena, activo, ...personales } = valores;
        const resultado = inicial ? datosUsuarioSchema.safeParse(personales) : crearUsuarioSchema.safeParse({ ...personales, contrasena, activo });
        if (!resultado.success) {
            for (const issue of resultado.error.issues) {
                const campo = issue.path[0];
                if (typeof campo === 'string' && campo in valores)
                    setError(campo as keyof Valores, { message: issue.message }, { shouldFocus: true });
            }
            return;
        }
        if (rol?.nombre !== 'Administrador' && !resultado.data.oficina_id) {
            setError('oficina_id', { message: 'La oficina es obligatoria para este rol' }, { shouldFocus: true });
            return;
        }
        await onGuardar(resultado.data);
    }
    return <form onSubmit={handleSubmit(enviar)} noValidate aria-busy={ocupado}>
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {([
                ['nombre', 'Nombres', 100], ['apellido', 'Apellidos', 120], ['nombre_usuario', 'Nombre de usuario', 64],
                ['email', 'Correo electrónico', 254], ['telefono', 'Teléfono', 30],
            ] as const).map(/** Compone cada campo personal con etiqueta, límites y error accesible. */([campo, titulo, max]) => <div className={styles.campo} key={campo}>
                <label htmlFor={`usuario-${campo}`}>
                    {titulo}
                    {campo === 'email' || campo === 'telefono' ? ' (opcional)' : ''}
                </label>
                <input id={`usuario-${campo}`} type={campo === 'email' ? 'email' : campo === 'telefono' ? 'tel' : 'text'} maxLength={max} disabled={ocupado} {...register(campo)} aria-invalid={!!errors[campo]} aria-describedby={errors[campo] ? `error-${campo}` : undefined} />
                {errors[campo] && <p id={`error-${campo}`} className={styles.error} role="alert">
                    {errors[campo]?.message}
                </p>}
            </div>)}
            <div className={styles.campo}>
                <label htmlFor="usuario-rol">Rol</label>
                <select id="usuario-rol" {...register('rol_id')} disabled={ocupado} aria-invalid={!!errors.rol_id}>
                    <option value="">Selecciona un rol</option>
                    {roles.map(/** Presenta un rol real del catálogo para asignarlo a la cuenta. */  registro => <option key={registro.id} value={registro.id}>
                        {registro.nombre}
                    </option>)}
                </select>
                {errors.rol_id && <p className={styles.error} role="alert">Selecciona un rol válido.</p>}
            </div>
            <div className={styles.campo}>
                <label htmlFor="usuario-oficina">Oficina{rol?.nombre === 'Administrador' ? ' (opcional)' : ''}
                </label>
                <select id="usuario-oficina" {...register('oficina_id')} disabled={ocupado} aria-invalid={!!errors.oficina_id}>
                    <option value="">Sin asignar</option>
                    {oficinas.filter(/** Limita las opciones cuando el rol exige una oficina institucional concreta. */  oficina => !oficinaObligatoria || oficina.nombre === oficinaObligatoria)
                        .map(/** Presenta la oficina disponible conservando su ID. */  registro => <option key={registro.id} value={registro.id}>
                            {registro.nombre}
                        </option>)}
                </select>
                {oficinaObligatoria && <small>Este rol corresponde a {oficinaObligatoria}.</small>}
                {errors.oficina_id && <p className={styles.error} role="alert">
                    {errors.oficina_id.message}
                </p>}
            </div>
            {!inicial && <>
                <div className={styles.campo}>
                    <label htmlFor="usuario-contrasena">Contraseña inicial</label>
                    <input id="usuario-contrasena" type="password" autoComplete="new-password" maxLength={1024} disabled={ocupado} {...register('contrasena')} aria-invalid={!!errors.contrasena} />
                    <small>Mínimo 8 caracteres. El usuario puede utilizar esta contraseña para iniciar sesión.</small>
                    {errors.contrasena && <p className={styles.error} role="alert">
                        {errors.contrasena.message}
                    </p>}
                </div>
                <div className={styles.campo}>
                    <label>
                        <input type="checkbox" {...register('activo')} disabled={ocupado} /> Cuenta activa</label>
                </div>
            </>}
        </div>
        {error && <p className={styles.error} role="alert">
            {error}
        </p>}
        <div className={styles.acciones}>
            <button className={styles.boton} disabled={ocupado}>
                {ocupado ? 'Guardando…' : 'Guardar cuenta'}
            </button>
            {!ocupado && <Link className={styles.secundario} to={inicial ? `/usuarios/${inicial.id}` : '/usuarios'}>Cancelar</Link>}
        </div>
    </form>;
}
