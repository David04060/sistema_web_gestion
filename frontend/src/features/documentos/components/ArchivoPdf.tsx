/** Archivo: Consulta el adjunto y coordina previsualización, carga, descarga y eliminación confirmada.
 */
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import {
  clientePdf,
  estadoPdfSchema,
  subirPdf,
  obtenerContenidoPdf,
  comprobarSeleccion,
  type EstadoPdf,
} from '../api/pdf.api';
import styles from '../../../components/ui/Admin.module.css';
import pdfStyles from './ArchivoPdf.module.css';
import { ResumenPdf, HerramientasPdf } from './ControlesPdf';
import { fechaLocal } from '../../../lib/fechas';
import { Esqueleto } from '../../../components/ui/Esqueleto';
const VisorPdf = lazy(() => import('./VisorPdf'));
/**
 * Cada cambio de sesión o documento invalida respuestas pendientes y descarta la selección local
 * anterior.
 */
export function ArchivoPdf({
  token,
  id,
  alCambiar,
}: {
  token: string;
  id: string;
  restringido?: boolean;
  alCambiar?: () => void;
}) {
  const [estado, setEstado] = useState<EstadoPdf>(),
    [ocupado, setOcupado] = useState(false),
    [error, setError] = useState(''),
    [mensaje, setMensaje] = useState(''),
    [confirmarEliminacion, setConfirmarEliminacion] = useState(false);
  const [bytes, setBytes] = useState<Uint8Array>(),
    [seleccion, setSeleccion] = useState<{
      archivo: File;
      bytes: Uint8Array;
      revision: string | null;
    }>();
  const selector = useRef<HTMLInputElement>(null),
    generacion = useRef(0);
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    const turno = ++generacion.current;
    setEstado(undefined);
    setBytes(undefined);
    setSeleccion(undefined);
    setConfirmarEliminacion(false);
    setError('');
    setMensaje('');
    void clientePdf(token, id)('consultar', {}, estadoPdfSchema).then(
      (v) => {
        if (turno === generacion.current) setEstado(v);
      },
      (e) => {
        if (turno === generacion.current)
          setError(e instanceof Error ? e.message : 'No se pudo consultar el PDF');
      },
    );
    return () => {
      generacion.current++;
    };
  }, [token, id, intento]);
  /** Ejecuta una acción y muestra su resultado solo si siguen seleccionados la misma cuenta y documento. */
  async function ejecutar(fn: (vigente: () => boolean) => Promise<void>) {
    const turno = generacion.current;
    setOcupado(true);
    setError('');
    setMensaje('');
    try {
      await fn(() => generacion.current === turno);
    } catch (e) {
      if (generacion.current === turno)
        setError(e instanceof Error ? e.message : 'No se pudo completar la operación');
    } finally {
      if (generacion.current === turno) setOcupado(false);
    }
  }
  /** Valida el archivo elegido y guarda sus bytes para la vista previa; todavía no envía nada a R2. */
  async function seleccionar(f: File, vigente: () => boolean) {
    setConfirmarEliminacion(false);
    comprobarSeleccion(f);
    const contenido = new Uint8Array(await f.arrayBuffer());
    if (vigente())
      setSeleccion({ archivo: f, bytes: contenido, revision: estado?.archivo?.revision ?? null });
  }
  /** Sube la selección con la revisión esperada y vuelve a consultar el adjunto confirmado por la API. */
  async function confirmar(vigente: () => boolean) {
    if (!seleccion) return;
    const pedir = clientePdf(token, id, undefined, vigente);
    await subirPdf(pedir, seleccion.archivo, seleccion.revision);
    const nuevo = await pedir('consultar', {}, estadoPdfSchema);
    if (vigente()) {
      setEstado(nuevo);
      setSeleccion(undefined);
      setBytes(undefined);
      setMensaje('PDF confirmado.');
      alCambiar?.();
    }
  }
  /** Solicita una lectura autorizada; descargar crea un archivo local y la otra opción abre el visor. */
  async function abrir(descargar: boolean, vigente: () => boolean) {
    const pedir = clientePdf(token, id, undefined, vigente);
    const enlace = await pedir(
      'abrir',
      { descargar },
      z.union([z.object({ url: z.url(), vence_en: z.number() }), z.object({ contenido: z.base64() })]),
    );
    // El destinatario recibe el contenido a través de la API; otros accesos usan un enlace temporal.
    const contenido =
      'contenido' in enlace
        ? Uint8Array.from(atob(enlace.contenido), (caracter) => caracter.charCodeAt(0))
        : await obtenerContenidoPdf(enlace.url, vigente);
    if (!vigente()) return;
    if (descargar) {
      const url = URL.createObjectURL(new Blob([contenido], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = estado?.archivo?.nombre ?? 'documento.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else setBytes(contenido);
  }
  /** Exige confirmación y revisión actual; retira el vínculo y presenta el estado de limpieza del objeto. */
  async function eliminar(vigente: () => boolean) {
    if (!estado?.archivo || !confirmarEliminacion) return;
    const nuevo = await clientePdf(
      token,
      id,
      undefined,
      vigente,
    )('eliminar', { revision: estado.archivo.revision, confirmar: true }, estadoPdfSchema);
    if (vigente()) {
      setEstado(nuevo);
      setConfirmarEliminacion(false);
      setBytes(undefined);
      setMensaje(nuevo.limpieza_pendiente ? 'PDF retirado del documento.' : 'PDF eliminado.');
      alCambiar?.();
    }
  }
  return (
    <section className={`${styles.tarjeta} ${pdfStyles.archivo}`}>
      <h2>Archivo PDF</h2>
      <input
        ref={selector}
        type="file"
        accept=".pdf,application/pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void ejecutar((v) => seleccionar(f, v));
        }}
      />
      {!estado && !error && <Esqueleto tipo="pdf" etiqueta="Consultando PDF…" />}
      {seleccion ? (
        <div className={pdfStyles.visor}>
          <p>
            <strong>{seleccion.archivo.name}</strong> · {(seleccion.archivo.size / 1024).toFixed(1)} KiB
          </p>
          <p>Previsualización local. El archivo todavía no se ha enviado.</p>
          {seleccion.revision && <p>Al confirmar se reemplazará el PDF actual.</p>}
          <Suspense fallback={<p>Preparando previsualización…</p>}>
            <VisorPdf bytes={seleccion.bytes} />
          </Suspense>
          <div className={pdfStyles.acciones}>
            <button type="button" disabled={ocupado} onClick={() => void ejecutar(confirmar)}>
              Confirmar subida
            </button>
            <button type="button" disabled={ocupado} onClick={() => setSeleccion(undefined)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        estado &&
        (bytes ? (
          <div className={pdfStyles.visor}>
            <HerramientasPdf
              modificar={estado.modificar}
              puedeEliminar={estado.eliminar ?? estado.modificar}
              ocupado={ocupado}
              volver={() => setBytes(undefined)}
              descargar={() => void ejecutar((v) => abrir(true, v))}
              seleccionar={() => selector.current?.click()}
              eliminar={() => setConfirmarEliminacion(true)}
            />
            {estado.archivo && (
              <p>
                {estado.archivo.nombre} · {(estado.archivo.tamano / 1024).toFixed(1)} KiB ·{' '}
                {fechaLocal(estado.archivo.cargado_en)}
              </p>
            )}
            <Suspense fallback={<p>Cargando visor…</p>}>
              <VisorPdf bytes={bytes} />
            </Suspense>
          </div>
        ) : (
          <ResumenPdf
            estado={estado}
            ocupado={ocupado}
            seleccionar={() => selector.current?.click()}
            abrir={() => void ejecutar((v) => abrir(false, v))}
          />
        ))
      )}
      {confirmarEliminacion && estado?.archivo && (
        <section className={styles.aviso} aria-label="Confirmar eliminación del PDF">
          <h3>¿Eliminar el PDF?</h3>
          <p>Se eliminará «{estado.archivo.nombre}». El registro documental y su historial se conservarán.</p>
          <div className={styles.acciones}>
            <button type="button" disabled={ocupado} onClick={() => void ejecutar(eliminar)}>
              Eliminar PDF
            </button>
            <button type="button" disabled={ocupado} onClick={() => setConfirmarEliminacion(false)}>
              Cancelar
            </button>
          </div>
        </section>
      )}
      {!!estado?.limpieza_pendiente && (
        <p role="status">El PDF ya no está disponible. Su eliminación está en proceso.</p>
      )}
      {ocupado && <p role="status">Procesando…</p>}
      {error && (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          {!estado && (
            <button type="button" onClick={() => setIntento((n) => n + 1)}>
              Reintentar
            </button>
          )}
        </div>
      )}
      {mensaje && (
        <p className={styles.exito} role="status">
          {mensaje}
        </p>
      )}
    </section>
  );
}
