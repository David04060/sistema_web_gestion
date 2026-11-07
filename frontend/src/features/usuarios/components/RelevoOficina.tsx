import { useCallback, useRef, useState } from 'react';
import { config } from '../../../api/documental';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import styles from '../../../components/ui/Admin.module.css';

type CuentaRelevo = { id: string; nombre: string; version_autenticacion: number };
/** Conserva en la confirmación las cuentas y versiones revisadas; el servidor las revalida. */
export function RelevoOficina({ token, oficina, alCambiar }: {
  token: string; oficina: string; alCambiar: () => void;
}) {
  const consulta = useConsulta(useCallback(() => config.relevo(token, oficina), [token, oficina]));
  const [reemplazo, setReemplazo] = useState(''), [motivo, setMotivo] = useState('');
  const [confirmacion, setConfirmacion] = useState<{ actual: CuentaRelevo; candidato: CuentaRelevo; motivo: string } | null>(null);
  const [ocupado, setOcupado] = useState(false), [error, setError] = useState(''), [mensaje, setMensaje] = useState('');
  const enviando = useRef(false), datos = consulta.datos, actual = datos?.responsable;
  const candidato = datos?.candidatos.find((c) => c.id === reemplazo);
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando.current || consulta.actualizando || !actual || !candidato || !motivo.trim()) return;
    if (!confirmacion) { setConfirmacion({ actual, candidato, motivo: motivo.trim() }); return; }
    enviando.current = true; setOcupado(true); setError(''); setMensaje('');
    try {
      await config.guardar(token, 'oficinas/' + oficina + '/relevo', {
        saliente_id: confirmacion.actual.id, reemplazo_id: confirmacion.candidato.id,
        version_saliente: confirmacion.actual.version_autenticacion,
        version_reemplazo: confirmacion.candidato.version_autenticacion, motivo: confirmacion.motivo,
      });
      setConfirmacion(null); setReemplazo(''); setMotivo('');
      setMensaje('Relevo confirmado. El archivo anterior conserva sus autores y queda de solo lectura.');
      consulta.recargar(); alCambiar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo confirmar el relevo');
      setConfirmacion(null); consulta.recargar();
    } finally { setOcupado(false); enviando.current = false; }
  }
  return <section className={styles.tarjeta}>
    <h2>Relevo de responsable</h2>
    <EstadoCarga {...consulta} reintentar={consulta.recargar} />
    {mensaje && <p role="status" className={styles.exito}>{mensaje}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {datos && (actual ? <form onSubmit={(e) => void enviar(e)}>
      <p>Responsable actual: <strong>{actual.nombre}</strong></p>
      <fieldset disabled={ocupado || !!confirmacion || consulta.actualizando}>
        <label className={styles.campo}>Reemplazo
          <select required value={reemplazo} onChange={(e) => setReemplazo(e.target.value)}>
            <option value="">Seleccionar cuenta</option>
            {datos.candidatos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <label className={styles.campo}>Motivo del relevo
          <textarea required maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
      </fieldset>
      {!datos.candidatos.length && <p>No hay cuentas elegibles. Crea primero una cuenta de reemplazo sin asignación a otra oficina.</p>}
      <p>La cuenta saliente se desactivará. El reemplazo consultará el archivo anterior sin poder modificarlo. Los estantes y archivadores personales no se transfieren.</p>
      {confirmacion && <p className={styles.aviso} role="status">¿Confirmar el relevo de {confirmacion.actual.nombre} por {confirmacion.candidato.nombre}?</p>}
      <div className={styles.acciones}>
        <button className={styles.boton} disabled={ocupado || consulta.actualizando || !candidato || !motivo.trim()}>
          {ocupado ? 'Procesando…' : confirmacion ? 'Confirmar relevo' : 'Revisar relevo'}
        </button>
        {confirmacion && <button type="button" className={styles.secundario} disabled={ocupado} onClick={() => setConfirmacion(null)}>Cancelar</button>}
      </div>
    </form> : <p>Esta oficina no tiene una cuenta activa asignada.</p>)}
  </section>;
}
