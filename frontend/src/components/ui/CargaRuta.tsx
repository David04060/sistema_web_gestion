/** Archivo: Muestra una espera accesible mientras se descarga el código de una pantalla.
 */
import styles from './Admin.module.css';
import { Esqueleto } from './Esqueleto';
/** Estado accesible para la descarga de una ruta; no verifica ni concede acceso. */
export function CargaRuta() {
  return (
    <main className={styles.pagina}>
      <Esqueleto tipo="detalle" etiqueta="Cargando pantalla…" />
    </main>
  );
}
