/** Archivo: Presenta actividad y responsable de una oficina y permite un relevo o cambio de actividad
 * autorizado.
 */
import { useCallback, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RelevoOficina } from '../components/RelevoOficina';
import { config } from '../../../api/documental';
import styles from '../../../components/ui/Admin.module.css';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { useConsulta } from '../../../hooks/useConsulta';
import { useAuth } from '../../auth/hooks/useAuth';
const institucional = (nombre: string) => ['Dirección', 'Mesa de Partes'].includes(nombre);
/** La actividad exige motivo y confirmación; las oficinas institucionales conservan su identidad. */
export function OficinaDetallePage() {
  const { id = '' } = useParams(),
    { token } = useAuth().sesion!,
    consulta = useConsulta(useCallback(() => config.oficina(token, id), [token, id]));
  const [motivo, setMotivo] = useState(''),
    [error, setError] = useState(''),
    [mensaje, setMensaje] = useState(''),
    [ocupado, setOcupado] = useState(false),
    [confirmando, setConfirmando] = useState(false),
    enviando = useRef(false),
    o = consulta.datos?.oficina;
  async function cambiar(e: React.FormEvent) {
    e.preventDefault();
    if (!o || enviando.current) return;
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    enviando.current = true;
    setOcupado(true);
    setError('');
    setMensaje('');
    try {
      await config.guardar(token, 'oficinas/' + id + '/actividad', {
        activa: !o.activa,
        motivo: motivo.trim(),
      });
      setMotivo('');
      setConfirmando(false);
      setMensaje(o.activa ? 'Oficina desactivada.' : 'Oficina activada.');
      consulta.recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la oficina');
    } finally {
      enviando.current = false;
      setOcupado(false);
    }
  }
  return (
    <main className={styles.pagina}>
      <h1>Detalle de oficina</h1>
      <EstadoCarga {...consulta} reintentar={consulta.recargar} />
      {mensaje && (
        <p className={styles.exito} role="status">
          {mensaje}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {o && (
        <>
          <section className={styles.tarjeta}>
            <h2>{o.nombre}</h2>
            <p>
              <span className={`${styles.estado} ${o.activa ? '' : styles.inactivo}`}>
                {o.activa ? 'Activa' : 'Inactiva'}
              </span>
            </p>
            {o.activa && <RelevoOficina token={token} oficina={id} alCambiar={consulta.recargar} />}
            {institucional(o.nombre) && (
              <p className={styles.aviso}>
                Dirección y Mesa de Partes conservan su nombre y permanecen activas.
              </p>
            )}
            <div className={styles.acciones}>
              {!institucional(o.nombre) && (
                <Link className={styles.boton} to={'/oficinas/' + id + '/editar'}>
                  Editar nombre
                </Link>
              )}
              <Link className={styles.secundario} to="/oficinas">
                Volver al listado
              </Link>
            </div>
          </section>
          {!institucional(o.nombre) && (
            <section className={styles.tarjeta}>
              <h2>Actividad de la oficina</h2>
              <form onSubmit={(e) => void cambiar(e)}>
                <label className={styles.campo}>
                  Motivo
                  <textarea
                    required
                    maxLength={1000}
                    value={motivo}
                    disabled={ocupado || confirmando}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                </label>
                {confirmando && (
                  <p className={styles.aviso} role="status">
                    ¿{o.activa ? 'Desactivar' : 'Activar'} la oficina «{o.nombre}»? Sus asignaciones
                    existentes se conservarán.
                  </p>
                )}
                <div className={styles.acciones}>
                  <button
                    className={o.activa ? styles.peligro : styles.boton}
                    disabled={ocupado || consulta.actualizando}
                  >
                    {ocupado
                      ? 'Guardando…'
                      : confirmando
                        ? o.activa
                          ? 'Confirmar desactivación'
                          : 'Confirmar activación'
                        : o.activa
                          ? 'Desactivar oficina'
                          : 'Activar oficina'}
                  </button>
                  {confirmando && (
                    <button
                      type="button"
                      className={styles.secundario}
                      disabled={ocupado}
                      onClick={() => setConfirmando(false)}
                    >
                      Cancelar cambio
                    </button>
                  )}
                </div>
              </form>
            </section>
          )}
        </>
      )}
    </main>
  );
}
