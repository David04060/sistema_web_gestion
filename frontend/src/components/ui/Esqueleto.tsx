/** Archivo: Dibuja marcadores de carga y anuncia la espera sin inventar cantidades de registros.
 */
import styles from './Esqueleto.module.css';

/** Formas de contenido sin cantidades ficticias; la carga se anuncia una sola vez. */
export function Esqueleto({
  tipo = 'lista',
  etiqueta = 'Cargando información…',
}: {
  tipo?: 'lista' | 'dashboard' | 'detalle' | 'pdf';
  etiqueta?: string;
}) {
  return (
    <div className={`${styles.carga} ${styles[tipo]}`} role="status" aria-label={etiqueta} aria-busy="true">
      <span className={styles.sr}>{etiqueta}</span>
      <div className={styles.formas} aria-hidden="true">
        {Array.from({ length: tipo === 'dashboard' ? 6 : tipo === 'pdf' ? 1 : 4 }, (_, i) => (
          <div className={styles.bloque} key={i}>
            <i />
            <i />
            <i />
          </div>
        ))}
      </div>
    </div>
  );
}
