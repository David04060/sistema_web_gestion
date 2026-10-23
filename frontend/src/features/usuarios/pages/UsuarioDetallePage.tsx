import { useCallback, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { fechaLocal } from '../../../lib/fechas';
import * as api from '../api/usuarios.api';
import { restablecerSchema } from '../schemas/usuarios.schema';
import { Confirmacion } from '../../../components/ui/Confirmacion';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import styles from '../../../components/ui/Admin.module.css';
/** Estado y contraseña se cambian por operaciones explícitas, confirmadas y auditadas. */
export function UsuarioDetallePage() {
    const { id = '' } = useParams();
    const auth = useAuth();
    const token = auth.sesion!.token;
    const consulta = useCallback(/** Consulta la proyección administrativa de la cuenta seleccionada. */() => api.detalle(token, id), [id, token]);
    const { datos, cargando, error, recargar } = useConsulta(consulta);
    const location = useLocation();
    const [mensaje, setMensaje] = useState(typeof location.state?.mensaje === 'string' ? location.state.mensaje : '');
    const [errorAccion, setErrorAccion] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [pendiente, setPendiente] = useState<{
        tipo: 'estado';
    } | {
        tipo: 'contrasena';
        contrasena: string;
    } | null>(null);
    const { register, handleSubmit, setError, reset, formState: { errors } } = useForm<{
        contrasena: string;
    }>({ defaultValues: { contrasena: '' } });
    /**
     * Ejecuta la acción administrativa pendiente; recarga el detalle de otra cuenta o cierra la sesión si se modificó la propia.
     */
    async function ejecutar() {
        if (!pendiente || !datos || ocupado)
            return;
        setOcupado(true);
        setErrorAccion('');
        setMensaje('');
        try {
            if (pendiente.tipo === 'estado') {
                await api.cambiarEstado(token, id, !datos.usuario.activo);
                setMensaje(datos.usuario.activo ? 'Cuenta desactivada. Sus sesiones anteriores ya no son válidas.' : 'Cuenta activada correctamente.');
            }
            else {
                const respuesta = await api.restablecer(token, id, pendiente.contrasena);
                reset({ contrasena: '' });
                setMensaje(respuesta.mensaje);
            }
            if (id === auth.sesion?.usuario.id)
                auth.cerrarSesion();
            else
                recargar();
        }
        catch (fallo) {
            setErrorAccion(fallo instanceof Error ? fallo.message : 'No se pudo completar la operación.');
        }
        finally {
            setOcupado(false);
            setPendiente(null);
        }
    }
    return <main className={styles.pagina}>
        <div className={styles.titulo}>
            <div>
                <h1>Información de la cuenta</h1>
            </div>
            <Link className={styles.secundario} to="/usuarios">Volver al listado</Link>
        </div>
        {mensaje && <p role="status" className={styles.exito}>
            {mensaje}
        </p>}
        {errorAccion && <p role="alert" className={styles.error}>
            {errorAccion}
        </p>}
        <EstadoCarga cargando={cargando} error={error} reintentar={recargar} />
        {datos && <>
            <section className={styles.tarjeta}>
                <h2>
                    {datos.usuario.nombre} {datos.usuario.apellido}
                </h2>
                <dl className={styles.datos}>
                    {[
                        ['Nombre de usuario', datos.usuario.nombre_usuario], ['Correo electrónico', datos.usuario.email ?? 'No registrado'],
                        ['Teléfono', datos.usuario.telefono ?? 'No registrado'], ['Rol', datos.usuario.rol], ['Oficina', datos.usuario.oficina ?? 'Sin asignar'],
                        ['Estado', datos.usuario.activo ? 'Activo' : 'Inactivo'], ['Registro', fechaLocal(datos.usuario.fecha_creacion)],
                        ['Última modificación', fechaLocal(datos.usuario.fecha_modificacion)],
                    ].map(/** Presenta un dato público de la cuenta como término y descripción. */([nombre, valor]) => <div key={nombre}>
                        <dt>
                            {nombre}
                        </dt>
                        <dd>
                            {valor}
                        </dd>
                    </div>)}
                </dl>
                <div className={styles.acciones}>
                    <Link className={styles.boton} to={`/usuarios/${id}/editar`}>Editar datos y asignaciones</Link>
                    <button className={datos.usuario.activo ? styles.peligro : styles.secundario} disabled={ocupado} onClick={/** Prepara el cambio de actividad de la cuenta para confirmación explícita. */() => setPendiente({ tipo: 'estado' })}>
                        {datos.usuario.activo ? 'Desactivar cuenta' : 'Activar cuenta'}
                    </button>
                </div>
            </section>
            <section className={styles.tarjeta}>
                <h2>Restablecer contraseña</h2>
                <p>La nueva contraseña invalidará las sesiones anteriores. Mínimo 8 caracteres.</p>
                <form onSubmit={handleSubmit(/** Valida la nueva contraseña y prepara su restablecimiento sin enviarlo antes de confirmar. */  valores => {
                    const resultado = restablecerSchema.safeParse(valores);
                    if (!resultado.success) {
                        setError('contrasena', { message: resultado.error.issues[0]?.message });
                        return;
                    }
                    setPendiente({ tipo: 'contrasena', contrasena: resultado.data.contrasena });
                })} noValidate>
                    <div className={styles.campo}>
                        <label htmlFor="nueva-contrasena">Nueva contraseña</label>
                        <input id="nueva-contrasena" type="password" autoComplete="new-password" maxLength={1024} {...register('contrasena')} disabled={ocupado} aria-invalid={!!errors.contrasena} />
                        {errors.contrasena && <p role="alert" className={styles.error}>
                            {errors.contrasena.message}
                        </p>}
                    </div>
                    <button className={styles.secundario} disabled={ocupado}>Restablecer contraseña</button>
                </form>
            </section>
        </>}
        {pendiente && datos && <Confirmacion titulo={pendiente.tipo === 'estado' ? (datos.usuario.activo ? 'Desactivar cuenta' : 'Activar cuenta') : 'Restablecer contraseña'} ocupado={ocupado} cancelar={/** Descarta la acción pendiente sin modificar la cuenta. */() => setPendiente(null)} confirmar={/** Ejecuta la acción administrativa después de su confirmación. */() => {
            void ejecutar();
        }}>
            <p>Cuenta: <strong>
                {datos.usuario.nombre_usuario}
            </strong>.</p>
            <p>
                {pendiente.tipo === 'contrasena' ? 'Se reemplazará la contraseña y se invalidarán los JWT anteriores.' :
                    datos.usuario.activo ? 'Se impedirá el acceso y se conservarán su historial y autoría.' : 'La cuenta volverá a poder iniciar sesión.'}
            </p>
            {id === auth.sesion?.usuario.id && <p>Esta es tu cuenta. Si la operación se completa, se cerrará tu sesión.</p>}
        </Confirmacion>}
    </main>;
}
