/** Archivo: Muestra nombre, tamaño y vista previa del PDF seleccionado antes de enviarlo.
 */
import { lazy, Suspense } from 'react';
import styles from '../../../components/ui/Admin.module.css';
import pdfStyles from './ArchivoPdf.module.css';
const Visor = lazy(() => import('./VisorPdf'));
function tamanoLegible(bytes: number) {
  const unidad = bytes >= 1024 * 1024 ? 'MiB' : bytes >= 1024 ? 'KiB' : 'bytes';
  const valor = bytes / (unidad === 'MiB' ? 1024 * 1024 : unidad === 'KiB' ? 1024 : 1);
  return `${valor.toLocaleString('es-PE', { maximumFractionDigits: 2 })} ${unidad}`;
}
/** Presentación de la selección local; no inicia ni confirma ninguna carga. */
export function PrevisualizacionRegistroPdf({
  archivo,
  bytes,
  ocupado,
  quitar,
}: {
  archivo: { name: string; size: number };
  bytes: Uint8Array;
  ocupado: boolean;
  quitar: () => void;
}) {
  return (
    <div className={`${styles.previsualizacionRegistro} ${pdfStyles.archivo}`}>
      <section className={styles.metadatosPdf}>
        <h3>Archivo seleccionado</h3>
        <dl>
          <div>
            <dt>Nombre</dt>
            <dd>{archivo.name}</dd>
          </div>
          <div>
            <dt>Tamaño</dt>
            <dd>{tamanoLegible(archivo.size)}</dd>
          </div>
        </dl>
        <button className={styles.secundario} type="button" disabled={ocupado} onClick={quitar}>
          Quitar selección
        </button>
      </section>
      <p className={styles.aviso} role="status">
        <strong>Aún no enviado.</strong> El archivo se enviará cuando confirmes el registro del documento.
      </p>
      <section className={styles.bloqueVisorPdf} aria-label="Previsualización local del PDF">
        <h3>Previsualización del PDF</h3>
        <Suspense fallback={<p role="status">Preparando previsualización…</p>}>
          <Visor bytes={bytes} />
        </Suspense>
      </section>
    </div>
  );
}
