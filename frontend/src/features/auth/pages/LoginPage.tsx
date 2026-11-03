import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { loginSchema, type LoginInput } from '../schemas/auth.schema';
import styles from '../styles/Login.module.css';
import logo from '../../../assets/logo-institucion.jpg';
import { SelectorTema } from '../../../components/ui/SelectorTema';
import { Icono } from '../../../components/icons/Icono';
interface Props {
  cargando: boolean;
  error: string;
  mensaje: string;
  onIngresar: (datos: LoginInput) => Promise<void>;
}
/** Presenta y valida el formulario existente; delega la autenticación al hook de la aplicación. */
export function LoginPage({ cargando, error, mensaje, onIngresar }: Props) {
  const [mostrarContrasena, setMostrarContrasena] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginInput>({
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
  return (
    <main className={styles.pagina}>
      <div className={styles.apariencia}>
        <SelectorTema />
      </div>
      <div className={styles.contenedor}>
        <header className={styles.encabezado}>
          <img
            className={styles.logo}
            src={logo}
            alt="Escudo oficial de la I.E. Enrique Paillardelle"
            width="104"
            height="104"
          />
          <span className={styles.institucion}>I.E. ENRIQUE PAILLARDELLE</span>
          <h1>La documentación institucional, en su lugar.</h1>
          <p>
            Registra, consulta y organiza los documentos de la I.E. Enrique Paillardelle desde un
            solo espacio.
          </p>
          <div className={styles.sello}>
            <Icono nombre="documentos" tamano={20} />
            <span>
              Sistema de Gestión Documental<small>Acceso para personal autorizado</small>
            </span>
          </div>
        </header>
        <section className={styles.tarjeta} aria-labelledby="titulo-login">
          <span className={styles.eyebrow}>BIENVENIDO A TU ESPACIO DE TRABAJO</span>
          <h2 id="titulo-login">Iniciar sesión</h2>
          <p className={styles.descripcion}>Ingresa tus credenciales para acceder al sistema.</p>
          <form onSubmit={handleSubmit(enviar)} noValidate aria-busy={cargando}>
            <div className={styles.campo}>
              <label htmlFor="identificador">Usuario o correo electrónico</label>
              <input
                id="identificador"
                type="text"
                autoComplete="username"
                placeholder="Ej.: nombre.apellido"
                maxLength={254}
                disabled={cargando}
                required
                aria-invalid={!!errors.identificador}
                aria-describedby={errors.identificador ? 'error-identificador' : undefined}
                {...register('identificador')}
              />
              {errors.identificador && (
                <p id="error-identificador" className={styles.error} role="alert">
                  {errors.identificador.message}
                </p>
              )}
            </div>
            <div className={styles.campo}>
              <label htmlFor="contrasena">Contraseña</label>
              <div className={styles.contrasena}>
                <input
                  id="contrasena"
                  type={mostrarContrasena ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Ingresa tu contraseña"
                  maxLength={1024}
                  disabled={cargando}
                  required
                  aria-invalid={!!errors.contrasena}
                  aria-describedby={errors.contrasena ? 'error-contrasena' : undefined}
                  {...register('contrasena')}
                />
                <button
                  type="button"
                  className={styles.mostrar}
                  aria-controls="contrasena"
                  aria-pressed={mostrarContrasena}
                  onClick={() => setMostrarContrasena((valor) => !valor)}
                >
                  {mostrarContrasena ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              {errors.contrasena && (
                <p id="error-contrasena" className={styles.error} role="alert">
                  {errors.contrasena.message}
                </p>
              )}
            </div>
            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}
            {mensaje && (
              <div className={styles.exito} role="status">
                {mensaje}
              </div>
            )}
            <button type="submit" className={styles.ingresar} disabled={cargando}>
              {cargando ? 'Verificando credenciales...' : 'Ingresar al sistema'}
            </button>
          </form>
        </section>
        <footer className={styles.pie}>
          ¿Necesitas acceso? Consulta con la administración del sistema.
          <br />
          Institución Educativa Enrique Paillardelle · Tacna
        </footer>
      </div>
    </main>
  );
}
