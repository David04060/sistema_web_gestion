import { useEffect, useId, useRef, useState } from 'react';
import { apiArchivo } from '../../../api/client';
import admin from '../../../components/ui/Admin.module.css';
import modal from '../../../components/ui/Confirmacion.module.css';
import styles from './ExportarDocumentos.module.css';

const meses = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
function periodoActual() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  return {
    anio: p.find((v) => v.type === 'year')!.value,
    mes: p.find((v) => v.type === 'month')!.value,
  };
}

/** La primera acción solo abre el diálogo. La generación comienza exclusivamente al confirmar el formulario. */
export function ExportarDocumentos({ token, rol, conRelacionados = false }: { token: string; rol: string; conRelacionados?: boolean }) {
  const [abierto, setAbierto] = useState(false),
    [periodo, setPeriodo] = useState(periodoActual),
    [ocupado, setOcupado] = useState(false),
    [estado, setEstado] = useState(''),
    [error, setError] = useState(''),
    [mensaje, setMensaje] = useState('');
  const dialogo = useRef<HTMLDialogElement>(null),
    control = useRef<AbortController | null>(null),
    generacion = useRef(0),
    enviando = useRef(false);
  const id = useId();
  useEffect(
    () => () => {
      generacion.current++;
      control.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!abierto) return;
    const d = dialogo.current;
    d?.showModal();
    return () => d?.close();
  }, [abierto]);
  function cancelar() {
    generacion.current++;
    control.current?.abort();
    enviando.current = false;
    setOcupado(false);
    dialogo.current?.close();
    setAbierto(false);
  }
  function cambiar(campo: 'anio' | 'mes', valor: string) {
    setPeriodo((p) => ({ ...p, [campo]: valor }));
    setError('');
    setMensaje('');
  }
  async function exportar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando.current) return;
    enviando.current = true;
    setOcupado(true);
    setError('');
    setMensaje('');
    setEstado('Generando archivo Excel…');
    const turno = ++generacion.current;
    const abortar = new AbortController();
    control.current = abortar;
    try {
      const q = new URLSearchParams(periodo);
      if(conRelacionados) q.set('con_relacionados','true');
      const { blob, total } = await apiArchivo(
        '/api/documentos/exportar-excel?' + q,
        token,
        AbortSignal.any([abortar.signal, AbortSignal.timeout(120000)]),
        () => {
          if (turno === generacion.current) setEstado('Descargando archivo…');
        },
      );
      if (turno !== generacion.current || abortar.signal.aborted) return;
      const nombre = `documentos-${periodo.anio}-${periodo.mes}.xlsx`,
        url = URL.createObjectURL(blob),
        enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombre;
      document.body.append(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setMensaje(
        total === 0
          ? 'No hay documentos en el mes elegido. Se descargó una hoja válida con encabezados.'
          : `Se inició la descarga de ${nombre} con ${total} ${total === 1 ? 'registro' : 'registros'}.`,
      );
    } catch (fallo) {
      if (turno === generacion.current && !abortar.signal.aborted)
        setError(
          fallo instanceof DOMException && fallo.name === 'TimeoutError'
            ? 'La exportación está tardando demasiado. Vuelve a intentarlo.'
            : fallo instanceof Error
              ? fallo.message
              : 'No se pudo exportar. Vuelve a intentarlo.',
        );
    } finally {
      if (turno === generacion.current) {
        enviando.current = false;
        setOcupado(false);
        setEstado('');
        control.current = null;
      }
    }
  }
  return (
    <>
      <button
        className={admin.secundario}
        type="button"
        onClick={() => {
          setError('');
          setMensaje('');
          setAbierto(true);
        }}
      >
        Exportar a Excel
      </button>
      {abierto && (
        <dialog
          ref={dialogo}
          className={`${modal.dialogo} ${styles.dialogo}`}
          aria-labelledby={id + '-titulo'}
          aria-describedby={id + '-alcance'}
          onCancel={(e) => {
            e.preventDefault();
            cancelar();
          }}
        >
          <h2 id={id + '-titulo'}>Exportar documentos a Excel</h2>
          <p id={id + '-alcance'}>
            {rol === 'Superadministrador'
              ? 'Vista global, incluidos los documentos anulados.'
              : rol === 'Usuario'
                ? 'Todos tus documentos consultables del mes.'
                : 'Todos los documentos que puedes consultar del mes.'}{' '}
            Se incluye el mes completo, sin limitarse a la página ni a los filtros del listado.
          </p>
          <form onSubmit={(e) => void exportar(e)}>
            <div className={admin.formularioDosColumnas}>
              <label className={admin.campo} htmlFor={id + '-anio'}>
                Año de registro
                <input
                  id={id + '-anio'}
                  type="number"
                  inputMode="numeric"
                  min="1900"
                  max="9999"
                  step="1"
                  required
                  value={periodo.anio}
                  disabled={ocupado}
                  onChange={(e) => cambiar('anio', e.target.value)}
                  autoFocus
                />
              </label>
              <label className={admin.campo} htmlFor={id + '-mes'}>
                Mes de registro
                <select
                  id={id + '-mes'}
                  required
                  value={periodo.mes}
                  disabled={ocupado}
                  onChange={(e) => cambiar('mes', e.target.value)}
                >
                  {meses.map((m, i) => (
                    <option key={m} value={String(i + 1).padStart(2, '0')}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className={styles.nota}>
              Fecha de registro en hora de Perú. Los datos y la situación corresponden al momento de
              exportar.
            </p>
            {ocupado && (
              <div role="status" className={styles.progreso}>
                <progress aria-label={estado} />
                <span>{estado}</span>
              </div>
            )}
            {error && (
              <p className={admin.error} role="alert">
                {error}
              </p>
            )}
            {mensaje && (
              <p className={admin.exito} role="status">
                {mensaje}
              </p>
            )}
            <div className={admin.acciones}>
              <button type="button" className={admin.secundario} onClick={cancelar}>
                Cancelar
              </button>
              <button type="submit" className={admin.boton} disabled={ocupado}>
                {ocupado ? 'Exportando…' : error ? 'Reintentar exportación' : 'Exportar a Excel'}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
