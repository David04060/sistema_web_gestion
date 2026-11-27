/** Archivo: Acciones individuales y recorrido cronológico, separado del historial de modificaciones. */
import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import {
  consultarAtencion,
  guardarAccion,
  prepararPdfAccion,
  abrirPdfAccion,
  type AccionRealizada,
} from '../api/atencion.api';
import { comprobarSeleccion } from '../api/pdf.api';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { fechaLocal } from '../../../lib/fechas';
import styles from '../../../components/ui/Admin.module.css';
import recorrido from './AtencionDocumento.module.css';
const VisorPdf = lazy(() => import('./VisorPdf'));
const tipos = {
  REGISTRO: 'Registro inicial',
  DELEGACION: 'Delegación',
  ACCION: 'Acción realizada',
  CORRECCION: 'Corrección de acción',
};
export function AtencionDocumento({
  token,
  id,
  alCambiar,
}: {
  token: string;
  id: string;
  alCambiar: () => void;
}) {
  const consulta = useConsulta(useCallback(() => consultarAtencion(token, id), [token, id]));
  const [edicion, setEdicion] = useState<AccionRealizada>(),
    [formulario, setFormulario] = useState(false),
    [descripcion, setDescripcion] = useState(''),
    [archivo, setArchivo] = useState<File>(),
    [retirar, setRetirar] = useState(false),
    [ocupado, setOcupado] = useState(false),
    [error, setError] = useState(''),
    [mensaje, setMensaje] = useState(''),
    [pdf, setPdf] = useState<{
      nombre: string;
      bytes: Uint8Array;
    }>();
  const enviando = useRef(false),
    cargaPendiente = useRef<
      | {
          archivo: File;
          carga: string;
        }
      | undefined
    >(undefined);
  function editar(a?: AccionRealizada) {
    setEdicion(a);
    setDescripcion(a?.descripcion ?? '');
    setArchivo(undefined);
    setRetirar(false);
    setFormulario(true);
    setError('');
    cargaPendiente.current = undefined;
  }
  async function guardar() {
    if (enviando.current) return;
    enviando.current = true;
    setOcupado(true);
    setError('');
    setMensaje('');
    try {
      let carga: string | undefined;
      if (archivo) {
        comprobarSeleccion(archivo);
        if (cargaPendiente.current?.archivo === archivo) carga = cargaPendiente.current.carga;
        else {
          const preparada = await prepararPdfAccion(token, id, archivo);
          const r = await fetch(preparada.url, {
            method: 'PUT',
            headers: preparada.headers,
            body: archivo,
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
          });
          if (!r.ok) throw Error('No se pudo subir el PDF. Puedes reintentar.');
          carga = preparada.carga;
          cargaPendiente.current = { archivo, carga };
        }
      }
      await guardarAccion(token, id, edicion?.id, {
        descripcion,
        revision: edicion?.revision,
        carga,
        retirar_pdf: retirar,
      });
      setFormulario(false);
      setEdicion(undefined);
      setDescripcion('');
      setArchivo(undefined);
      setPdf(undefined);
      cargaPendiente.current = undefined;
      setMensaje('Acción guardada correctamente.');
      consulta.recargar();
      alCambiar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la acción');
    } finally {
      enviando.current = false;
      setOcupado(false);
    }
  }
  async function abrir(accionId: string, nombre: string) {
    if (enviando.current) return;
    enviando.current = true;
    setOcupado(true);
    setError('');
    try {
      const r = await abrirPdfAccion(token, id, accionId);
      setPdf({ nombre, bytes: Uint8Array.from(atob(r.contenido), (c) => c.charCodeAt(0)) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el PDF');
    } finally {
      enviando.current = false;
      setOcupado(false);
    }
  }
  return (
    <>
      <section className={styles.tarjeta}>
        <h2>Acciones realizadas</h2>
        <EstadoCarga {...consulta} reintentar={consulta.recargar} />
        {mensaje && (
          <p role="status" className={styles.exito}>
            {mensaje}
          </p>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {consulta.datos?.puede_agregar && !formulario && (
          <button className={styles.boton} onClick={() => editar()}>
            Agregar acción realizada
          </button>
        )}
        {formulario && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void guardar();
            }}
          >
            <fieldset disabled={ocupado} className={recorrido.formulario}>
              <legend>{edicion ? 'Corregir mi acción' : 'Nueva acción realizada'}</legend>
              <label className={styles.campo}>
                Descripción de la acción realizada
                <textarea
                  required
                  maxLength={20000}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
              </label>
              <label className={styles.campo}>
                PDF opcional (hasta 15 MB)
                <input
                  key={edicion?.id ?? 'nueva'}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => {
                    setArchivo(e.target.files?.[0]);
                    setRetirar(false);
                    cargaPendiente.current = undefined;
                  }}
                />
              </label>
              {edicion?.pdf_nombre && (
                <label>
                  <input
                    type="checkbox"
                    checked={retirar}
                    disabled={!!archivo}
                    onChange={(e) => setRetirar(e.target.checked)}
                  />{' '}
                  Retirar PDF actual: {edicion.pdf_nombre}
                </label>
              )}
              <div className={styles.acciones}>
                <button className={styles.boton}>{ocupado ? 'Guardando…' : 'Guardar acción'}</button>
                <button type="button" className={styles.secundario} onClick={() => setFormulario(false)}>
                  Cancelar
                </button>
              </div>
            </fieldset>
          </form>
        )}
        {consulta.datos?.acciones.length === 0 && <p>Todavía no se registraron acciones.</p>}
        <div className="grid gap-4 mt-4">
          {consulta.datos?.acciones.map((a) => (
            <article className={recorrido.accion} key={a.id}>
              <h3>{a.responsable}</h3>
              <p className={recorrido.meta}>
                {a.oficina_nombre && <>{a.oficina_nombre} · </>}
                {fechaLocal(a.creado_en)}
                {a.revision !== '1' && ' · Corregida'}
              </p>
              <p className={recorrido.texto}>{a.descripcion}</p>
              <div className={styles.acciones}>
                {a.pdf_nombre && (
                  <button
                    disabled={ocupado}
                    className={styles.secundario}
                    onClick={() => void abrir(a.id, a.pdf_nombre!)}
                  >
                    Ver PDF: {a.pdf_nombre}
                  </button>
                )}
                {a.corregir && (
                  <button disabled={ocupado} className={styles.secundario} onClick={() => editar(a)}>
                    Corregir mi acción
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
        {pdf && (
          <section aria-label="PDF de la acción">
            <h3>{pdf.nombre}</h3>
            <button className={styles.secundario} onClick={() => setPdf(undefined)}>
              Cerrar PDF de acción
            </button>
            <Suspense fallback={<p role="status">Cargando visor…</p>}>
              <VisorPdf bytes={pdf.bytes} />
            </Suspense>
          </section>
        )}
      </section>
      <section className={styles.tarjeta}>
        <h2>Recorrido documental</h2>
        <p>
          Registro, delegaciones y acciones en orden cronológico. Cada responsable conserva su participación.
        </p>
        <ol className={recorrido.recorrido}>
          {consulta.datos?.eventos.map((e) => (
            <li key={e.id} className={recorrido.evento} data-tipo={e.tipo}>
              <div className={recorrido.cabecera}>
                <span className={recorrido.tipo}>{tipos[e.tipo]}</span>
                <time dateTime={e.fecha}>{fechaLocal(e.fecha)}</time>
              </div>
              <h3>{e.responsable}</h3>
              {e.oficina && <p className={recorrido.meta}>{e.oficina}</p>}
              {e.tipo === 'DELEGACION' ? (
                <>
                  <p>
                    Delegó a <strong>{e.descripcion}</strong>
                  </p>
                  <p className={recorrido.texto}>
                    <strong>Indicaciones: </strong>
                    {e.indicaciones || 'Sin indicaciones'}
                  </p>
                </>
              ) : (
                <p className={recorrido.texto}>{e.descripcion}</p>
              )}
              {e.tipo === 'CORRECCION' && (
                <dl className={recorrido.cambios}>
                  <dt>Descripción anterior</dt>
                  <dd>{e.anterior?.descripcion}</dd>
                  <dt>Descripción corregida</dt>
                  <dd>{e.posterior?.descripcion}</dd>
                  <dt>PDF anterior</dt>
                  <dd>{e.anterior?.pdf_nombre ?? 'Sin PDF'}</dd>
                  <dt>PDF posterior</dt>
                  <dd>{e.posterior?.pdf_nombre ?? 'Sin PDF'}</dd>
                </dl>
              )}
              {e.accion_id && consulta.datos?.acciones.find((a) => a.id === e.accion_id)?.pdf_nombre && (
                <button
                  disabled={ocupado}
                  className={styles.secundario}
                  onClick={() => {
                    const a = consulta.datos!.acciones.find((a) => a.id === e.accion_id)!;
                    void abrir(a.id, a.pdf_nombre!);
                  }}
                >
                  Ver PDF vigente de la acción
                </button>
              )}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
