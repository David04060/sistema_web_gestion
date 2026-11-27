/** Archivo: Permite delegar, ubicar o anular con los permisos y la revisión recibidos del servidor.
 */
import { useCallback, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type DocumentoActual, type UbicacionElegible } from '../../../api/documental';
import { ApiError } from '../../../api/client';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { DestinoDocumental, destinoVacio, datosDestino } from './DestinoDocumental';
import { SelectorUbicacion } from './SelectorUbicacion';
import styles from '../../../components/ui/Admin.module.css';
/** Envía solo acciones concedidas por el servidor; la revisión protege contra escrituras concurrentes. */
export function AccionesDocumento({
  token,
  documento: d,
  actualizar,
}: {
  token: string;
  documento: DocumentoActual;
  actualizar: (documento: DocumentoActual, mensaje: string) => void;
}) {
  const grupoAcciones = useId();
  const navegar = useNavigate(),
    [destino, setDestino] = useState(destinoVacio),
    [unidad, setUnidad] = useState<UbicacionElegible | null>(null),
    [motivo, setMotivo] = useState(''),
    [error, setError] = useState(''),
    [ocupado, setOcupado] = useState(false);
  const enviando = useRef(false),
    [confirmacion, setConfirmacion] = useState<'delegar' | 'anular' | null>(null);
  const necesitaOpciones = d.permisos.delegar;
  const opciones = useConsulta(
    useCallback(() => api.opciones(token), [token]),
    { habilitada: necesitaOpciones },
  );
  async function ejecutar(tipo: 'delegar' | 'ubicar' | 'anular', confirmado = false) {
    if (enviando.current) return;
    setError('');
    if ((tipo === 'delegar' || tipo === 'anular') && !confirmado) {
      setConfirmacion(tipo);
      return;
    }
    setConfirmacion(null);
    enviando.current = true;
    setOcupado(true);
    try {
      if (tipo === 'delegar') {
        const resultado = await api.delegar(token, d.id, {
          revision: d.revision,
          ...datosDestino(destino),
        });
        actualizar(resultado.documento, 'Delegación confirmada correctamente.');
        return;
      }
      if (tipo === 'ubicar') {
        if (!unidad) throw Error('Selecciona una unidad propia.');
        const resultado = await api.ubicar(token, d.id, {
          revision: d.revision,
          unidad_id: unidad.id,
        });
        actualizar(resultado.documento, 'Ubicación guardada correctamente.');
        return;
      }
      if (tipo === 'anular') {
        if (!motivo.trim()) throw Error('El motivo es obligatorio.');
        await api.anular(token, d.id, { revision: d.revision, motivo: motivo.trim() });
        navegar('/documentos', {
          replace: true,
          state: { mensaje: 'Registro anulado. Se conserva su historial.' },
        });
        return;
      }
    } catch (e) {
      const detalle = e instanceof Error ? e.message : 'No se pudo completar la operación';
      const estado = e instanceof ApiError && e.status > 0 ? ' (HTTP ' + e.status + ')' : '';
      setError(detalle + estado + (tipo === 'delegar' ? ' La selección se conserva para reintentar.' : ''));
      enviando.current = false;
    } finally {
      if (tipo !== 'delegar') enviando.current = false;
      if (!enviando.current) setOcupado(false);
    }
  }
  return (
    <section className={styles.tarjeta}>
      <h2>Acciones autorizadas</h2>
      {confirmacion && (
        <section className={styles.aviso} aria-label="Confirmar acción documental">
          <p>
            {confirmacion === 'delegar'
              ? '¿Confirmar la delegación a la persona seleccionada?'
              : '¿Anular este registro? Se conservará su historia y solo podrá consultarlo Superadministración.'}
          </p>
          <div className={styles.acciones}>
            <button
              type="button"
              className={styles.boton}
              disabled={ocupado}
              onClick={() => void ejecutar(confirmacion, true)}
            >
              {confirmacion === 'delegar' ? 'Delegar documento' : 'Anular registro'}
            </button>
            <button
              type="button"
              className={styles.secundario}
              disabled={ocupado}
              onClick={() => setConfirmacion(null)}
            >
              Cancelar
            </button>
          </div>
        </section>
      )}
      {necesitaOpciones && <EstadoCarga {...opciones} reintentar={opciones.recargar} />}
      {d.permisos.delegar && opciones.datos && (
        <details
          name={grupoAcciones}
          onToggle={(e) => {
            if (!e.currentTarget.open) setConfirmacion(null);
          }}
        >
          <summary>Delegar documento</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ejecutar('delegar');
            }}
          >
            <fieldset className={styles.grupoDestino} disabled={ocupado || confirmacion !== null}>
              <DestinoDocumental
                token={token}
                valor={destino}
                cambiar={setDestino}
                opciones={opciones.datos}
              />
            </fieldset>
            <button className={styles.boton} disabled={ocupado}>
              {ocupado ? 'Procesando…' : 'Confirmar delegación'}
            </button>
          </form>
        </details>
      )}
      {d.permisos.ubicar && (
        <details
          name={grupoAcciones}
          onToggle={(e) => {
            if (!e.currentTarget.open) setConfirmacion(null);
          }}
        >
          <summary>{d.ubicacion ? 'Actualizar ubicación' : 'Guardar en una ubicación propia'}</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ejecutar('ubicar');
            }}
          >
            <SelectorUbicacion token={token} valor={unidad} cambiar={setUnidad} deshabilitado={ocupado} />
            <button className={styles.boton} disabled={ocupado || !unidad}>
              Guardar ubicación
            </button>
          </form>
        </details>
      )}
      {d.permisos.anular && (
        <details
          name={grupoAcciones}
          onToggle={(e) => {
            if (!e.currentTarget.open) setConfirmacion(null);
          }}
        >
          <summary>Anular registro</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ejecutar('anular');
            }}
          >
            <label className={styles.campo}>
              Motivo de anulación
              <textarea
                required
                maxLength={1000}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </label>
            <button className={styles.peligro} disabled={ocupado}>
              Anular registro
            </button>
          </form>
        </details>
      )}
      {ocupado && <p role="status">Procesando…</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
