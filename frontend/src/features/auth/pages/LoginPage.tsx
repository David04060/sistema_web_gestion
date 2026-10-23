import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { loginSchema, type LoginInput } from '../schemas/auth.schema';
import styles from '../styles/Login.module.css';
interface Props {
    cargando: boolean;
    error: string;
    mensaje: string;
    onIngresar: (datos: LoginInput) => Promise<void>;
}
/** Presenta y valida el formulario existente; delega la autenticación al hook de la aplicación. */
export function LoginPage({ cargando, error, mensaje, onIngresar }: Props) {
    const [mostrarContrasena, setMostrarContrasena] = useState(false);
    const { register, handleSubmit, setError, formState: { errors } } = useForm<LoginInput>({
        defaultValues: { identificador: '', contrasena: '' },
    });
    /**
     * Valida las credenciales con Zod, asigna errores a los campos y delega la autenticación; no almacena la contraseña.
     * @param datos - Datos de entrada según el contrato tipado de esta operación.
     */
    async function enviar(datos: LoginInput): Promise<void> {
        const resultado = loginSchema.safeParse(datos);
        if (!resultado.success) {
            for (const issue of resultado.error.issues) {
                const campo = issue.path[0];
                if (campo === 'identificador' || campo === 'contrasena') {
                    setError(campo, { message: issue.message }, { shouldFocus: true });
                }
            }
            return;
        }
        await onIngresar(resultado.data);
    }
    return (<main className={styles.pagina}>
        <div className={styles.contenedor}>
            <header className={styles.encabezado}>
                <div className={styles.logo} aria-hidden="true">EP</div>
                <span className={styles.institucion}>I.E. ENRIQUE PAILLARDELLE</span>
                <h1>Sistema Web Documental</h1>
                <p>Gestión, organización, búsqueda y ubicación de documentos institucionales.</p>
            </header>
            <section className={styles.tarjeta} aria-labelledby="titulo-login">
                <h2 id="titulo-login">Iniciar sesión</h2>
                <p className={styles.descripcion}>Ingresa tus credenciales para acceder al sistema.</p>
                <form onSubmit={handleSubmit(enviar)} noValidate aria-busy={cargando}>
                    <div className={styles.campo}>
                        <label htmlFor="identificador">Usuario o correo electrónico</label>
                        <input id="identificador" type="text" autoComplete="username" placeholder="Ingresa tu usuario o correo" maxLength={254} disabled={cargando} required aria-invalid={!!errors.identificador} aria-describedby={errors.identificador ? 'error-identificador' : undefined} {...register('identificador')} />
                        {errors.identificador && <p id="error-identificador" className={styles.error} role="alert">
                            {errors.identificador.message}
                        </p>}
                    </div>
                    <div className={styles.campo}>
                        <label htmlFor="contrasena">Contraseña</label>
                        <div className={styles.contrasena}>
                            <input id="contrasena" type={mostrarContrasena ? 'text' : 'password'} autoComplete="current-password" placeholder="Ingresa tu contraseña" maxLength={1024} disabled={cargando} required aria-invalid={!!errors.contrasena} aria-describedby={errors.contrasena ? 'error-contrasena' : undefined} {...register('contrasena')} />
                            <button type="button" className={styles.mostrar} aria-controls="contrasena" aria-pressed={mostrarContrasena} onClick={/** Solicita alternar la visibilidad de la contraseña sin cambiar su valor. */() => setMostrarContrasena(/** Invierte exclusivamente la presentación visible u oculta del campo de contraseña. */  valor => !valor)}>
                                {mostrarContrasena ? 'Ocultar' : 'Mostrar'}
                            </button>
                        </div>
                        {errors.contrasena && <p id="error-contrasena" className={styles.error} role="alert">
                            {errors.contrasena.message}
                        </p>}
                    </div>
                    {error && <div className={styles.error} role="alert">
                        {error}
                    </div>}
                    {mensaje && <div className={styles.exito} role="status">
                        {mensaje}
                    </div>}
                    <button type="submit" className={styles.ingresar} disabled={cargando}>
                        {cargando ? 'Verificando credenciales...' : 'Ingresar al sistema'}
                    </button>
                </form>
            </section>
            <footer className={styles.pie}>Institución Educativa Enrique Paillardelle</footer>
        </div>
    </main>);
}
