import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { Confirmacion } from '../../../components/ui/Confirmacion';
import * as api from '../api/siseve.api';
import styles from '../../../components/ui/Admin.module.css';
/** Administra permisos y hash compartido sin consultar contenido documental. */
export function SiseveAdministracionPage() {
    const token = useAuth().sesion!.token;
    const consulta = useConsulta(useCallback(/** Consulta configuración y permisos individuales desde el endpoint administrativo. */() => api.administracion(token), [token]), { restringida: true });
    const [error, setError] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [cambio, setCambio] = useState<{
        id: string;
        activo: boolean;
        nombre: string;
    } | null>(null);
    const { register, handleSubmit, reset } = useForm<{
        contrasena: string;
        confirmacion: string;
    }>();
    /**
     * Valida longitud y repetición de la nueva clave; limpia los campos antes de solicitar su cambio administrativo y también ante datos inválidos.
     * @param datos - Datos de entrada según el contrato tipado de esta operación.
     */
    async function clave(datos: {
        contrasena: string;
        confirmacion: string;
    }) {
        setError('');
        setMensaje('');
        if (datos.contrasena.length < 8 || datos.contrasena.length > 1024 || datos.contrasena !== datos.confirmacion) {
            setError('Las contraseñas deben coincidir y tener entre 8 y 1024 caracteres.');
            reset();
            return;
        }
        reset();
        setOcupado(true);
        try {
            await api.cambiarClave(token, datos.contrasena);
            setMensaje('Contraseña compartida actualizada. La anterior ya no permite nuevas operaciones.');
            consulta.recargar();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo actualizar');
        }
        finally {
            setOcupado(false);
        }
    }
    /**
     * Confirma el cambio de autorización individual, actualiza el listado y comunica el resultado sin conceder acceso documental por rol técnico.
     */
    async function permiso() {
        if (!cambio)
            return;
        setOcupado(true);
        setError('');
        try {
            await api.autorizar(token, cambio.id, cambio.activo);
            setMensaje('Autorización actualizada.');
            setCambio(null);
            consulta.recargar();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo actualizar');
        }
        finally {
            setOcupado(false);
        }
    }
    return <main className={styles.pagina}>
        <h1>Administración de SíseVe</h1>
        <p>Administrar estas autorizaciones no concede acceso al contenido ni revela la contraseña vigente.</p>
        <EstadoCarga {...consulta} reintentar={consulta.recargar} />
        {error && <p role="alert" className={styles.error}>
            {error}
        </p>}
        {mensaje && <p role="status">
            {mensaje}
        </p>}
        {consulta.datos && <>
            <section className={styles.tarjeta}>
                <h2>Contraseña adicional compartida</h2>
                <p>
                    {consulta.datos.configuracion.clave_configurada ? 'Existe una contraseña configurada.' : 'Es necesario configurar la contraseña antes de operar.'}
                </p>
                <form onSubmit={handleSubmit(clave)} autoComplete="off">
                    <div className={styles.campo}>
                        <label htmlFor="nueva-clave">Nueva contraseña compartida</label>
                        <input id="nueva-clave" type="password" autoComplete="new-password" required minLength={8} maxLength={1024} {...register('contrasena')} />
                    </div>
                    <div className={styles.campo}>
                        <label htmlFor="confirmar-clave">Confirmar nueva contraseña</label>
                        <input id="confirmar-clave" type="password" autoComplete="new-password" required minLength={8} maxLength={1024} {...register('confirmacion')} />
                    </div>
                    <p>La rotación reemplaza la clave anterior para todos los autorizados. Comuníquela mediante el canal institucional autorizado.</p>
                    <button className={styles.boton} disabled={ocupado}>Configurar o rotar contraseña</button>
                </form>
            </section>
            <section className={styles.tarjeta}>
                <h2>Autorizaciones individuales</h2>
                <div className={styles.tabla}>
                    <table>
                        <thead>
                            <tr>
                                <th>Usuario</th>
                                <th>Cuenta</th>
                                <th>Acceso SíseVe</th>
                                <th>Operación</th>
                            </tr>
                        </thead>
                        <tbody>
                            {consulta.datos.usuarios.map(/** Presenta cuenta y autorización individual sin contenido documental restringido. */  u => <tr key={u.usuario_id}>
                                <td>
                                    {u.nombre}
                                </td>
                                <td>
                                    {u.cuenta_activa ? 'Activa' : 'Inactiva'}
                                </td>
                                <td>
                                    {u.autorizado ? 'Autorizado' : 'Sin autorización'}
                                </td>
                                <td>
                                    <button className={styles.secundario} disabled={ocupado || (!u.cuenta_activa && !u.autorizado)} onClick={/** Prepara la activación o revocación del permiso para confirmación explícita. */() => setCambio({ id: u.usuario_id, activo: !u.autorizado, nombre: u.nombre })}>
                                        {u.autorizado ? 'Revocar' : 'Autorizar'}
                                    </button>
                                </td>
                            </tr>)}
                        </tbody>
                    </table>
                </div>
            </section>
        </>}
        {cambio && <Confirmacion titulo={cambio.activo ? 'Conceder autorización individual' : 'Revocar autorización individual'} ocupado={ocupado} cancelar={/** Descarta el cambio de permiso pendiente sin enviar solicitudes. */() => setCambio(null)} confirmar={/** Ejecuta el cambio de permiso que acaba de confirmar el administrador. */() => {
            void permiso();
        }}>
            <p>
                {cambio.nombre}: {cambio.activo ? 'también deberá conocer la contraseña adicional en cada operación.' : 'no podrá ejecutar nuevas operaciones protegidas después de confirmar la revocación.'}
            </p>
        </Confirmacion>}
    </main>;
}
