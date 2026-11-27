/** Archivo: Muestra una cuenta y exige confirmación al cambiar su contraseña o actividad.
 */
import { useCallback, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { config } from '../../../api/documental';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import styles from '../../../components/ui/Admin.module.css';
export function UsuarioDetallePage() {
  const { id = '' } = useParams(),
    { token, usuario: actor } = useAuth().sesion!;
  const consulta = useConsulta(useCallback(() => config.usuario(token, id), [token, id]));
  const [clave, setClave] = useState(''),
    [motivo, setMotivo] = useState(''),
    [error, setError] = useState(''),
    [mensaje, setMensaje] = useState(''),
    [ocupado, setOcupado] = useState(false),
    enviando = useRef(false),
    [confirmacion, setConfirmacion] = useState<'clave' | 'actividad' | null>(null);
  const u = consulta.datos?.usuario,
    editable = !!u && (u.rol_id !== 1 || actor.rol === 'Superadministrador');
  async function ejecutar(e: React.FormEvent, tipo: 'clave' | 'actividad', confirmado = false) {
    e.preventDefault();
    if (!u || enviando.current) return;
    if (!confirmado) {
      setConfirmacion(tipo);
      return;
    }
    setConfirmacion(null);
    enviando.current = true;
    setOcupado(true);
    setError('');
    setMensaje('');
    try {
      await config.guardar(
        token,
        'usuarios/' + id + '/' + tipo,
        tipo === 'clave' ? { contrasena: clave } : { activo: !u.activo, motivo: motivo.trim() },
      );
      setClave('');
      setMotivo('');
      setMensaje(
        tipo === 'clave' ? 'Contraseña actualizada.' : u.activo ? 'Cuenta desactivada.' : 'Cuenta activada.',
      );
      consulta.recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar');
    } finally {
      enviando.current = false;
      setOcupado(false);
    }
  }
  return (
    <main className={styles.pagina}>
      <h1>Cuenta</h1>
      <EstadoCarga {...consulta} tipo="detalle" reintentar={consulta.recargar} />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {mensaje && (
        <p className={styles.exito} role="status">
          {mensaje}
        </p>
      )}
      {u && (
        <>
          {confirmacion && (
            <section className={styles.aviso} aria-label="Confirmar cambio de cuenta">
              <p>
                {confirmacion === 'clave'
                  ? '¿Cambiar la contraseña y cerrar las sesiones de esta cuenta?'
                  : u.activo
                    ? '¿Desactivar esta cuenta y cerrar sus sesiones?'
                    : '¿Activar esta cuenta?'}
              </p>
              <div className={styles.acciones}>
                <button
                  type="button"
                  className={styles.boton}
                  disabled={ocupado}
                  onClick={(e) => void ejecutar(e, confirmacion, true)}
                >
                  {confirmacion === 'clave'
                    ? 'Cambiar contraseña'
                    : u.activo
                      ? 'Desactivar cuenta'
                      : 'Activar cuenta'}
                </button>
                <button
                  type="button"
                  className={styles.secundario}
                  disabled={ocupado}
                  onClick={() => setConfirmacion(null)}
                >
                  Cancelar cambio
                </button>
              </div>
            </section>
          )}
          <section className={styles.tarjeta}>
            <h2>
              {u.nombre} {u.apellido}
            </h2>
            <dl className={styles.datos}>
              <div>
                <dt>Usuario</dt>
                <dd>{u.nombre_usuario}</dd>
              </div>
              <div>
                <dt>Rol</dt>
                <dd>{u.rol}</dd>
              </div>
              <div>
                <dt>Oficina</dt>
                <dd>{u.oficina ?? 'Sin oficina'}</dd>
              </div>
              <div>
                <dt>Correo</dt>
                <dd>{u.email ?? '—'}</dd>
              </div>
              <div>
                <dt>Teléfono</dt>
                <dd>{u.telefono ?? '—'}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>{u.activo ? 'Activa' : 'Inactiva'}</dd>
              </div>
            </dl>
            <div className={styles.acciones}>
              {editable && (
                <Link className={styles.boton} to={'/usuarios/' + id + '/editar'}>
                  Editar cuenta y asignación
                </Link>
              )}
              <Link className={styles.secundario} to="/usuarios">
                Volver
              </Link>
            </div>
          </section>
          {editable && u.rol_id !== 1 && (
            <section className={styles.tarjeta}>
              <h2>Actividad de la cuenta</h2>
              <form onSubmit={(e) => void ejecutar(e, 'actividad')}>
                <label className={styles.campo}>
                  Motivo
                  <input
                    required
                    disabled={ocupado || confirmacion !== null}
                    maxLength={1000}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                </label>
                <button
                  className={u.activo ? styles.peligro : styles.boton}
                  disabled={ocupado || consulta.actualizando}
                >
                  {u.activo ? 'Desactivar cuenta' : 'Activar cuenta'}
                </button>
              </form>
            </section>
          )}
          {editable && (
            <section className={styles.tarjeta}>
              <h2>Cambiar contraseña</h2>
              <form onSubmit={(e) => void ejecutar(e, 'clave')}>
                <label className={styles.campo}>
                  Nueva contraseña (8–128 caracteres)
                  <input
                    type="password"
                    required
                    disabled={ocupado || confirmacion !== null}
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    value={clave}
                    onChange={(e) => setClave(e.target.value)}
                  />
                </label>
                <button className={styles.secundario} disabled={ocupado}>
                  Cambiar contraseña
                </button>
              </form>
            </section>
          )}
        </>
      )}
    </main>
  );
}
