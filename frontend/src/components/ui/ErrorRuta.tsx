/** Archivo: Presenta recuperación cuando falla una pantalla y permite intentar otra ruta.
 */
import { Component, type ReactNode } from 'react';
import styles from './Admin.module.css';
interface Props {
  children: ReactNode;
  ruta: string;
}
/** Captura una descarga fallida de pantalla. Recargar revalida la sesión y no repite escrituras. */
export class ErrorRuta extends Component<
  Props,
  {
    fallo: boolean;
  }
> {
  state = { fallo: false };
  /**
   * Activa la vista de recuperación cuando React captura un error de renderizado o de descarga de
   * una pantalla.
   */
  static getDerivedStateFromError() {
    return { fallo: true };
  }
  /**
   * Retira el fallo al cambiar la ruta para permitir que otra pantalla se renderice sin recargar
   * toda la aplicación. @param anterior - Propiedades del render anterior para detectar un cambio de
   * ruta.
   */
  componentDidUpdate(anterior: Props) {
    if (this.state.fallo && anterior.ruta !== this.props.ruta) this.setState({ fallo: false });
  }
  /**
   * Muestra los hijos mientras no haya fallo; en caso contrario ofrece una recarga explícita sin
   * repetir escrituras.
   */
  render() {
    if (!this.state.fallo) return this.props.children;
    return (
      <main className={styles.pagina}>
        <section className={styles.tarjeta}>
          <h1>No se pudo cargar la pantalla</h1>
          <p role="alert">Comprueba la conexión y vuelve a cargar esta página.</p>
          <button
            className={styles.secundario}
            onClick={
              /** Recarga explícitamente la página para volver a descargar los recursos; no reenvía formularios. */ () =>
                window.location.reload()
            }
          >
            Recargar pantalla
          </button>
        </section>
      </main>
    );
  }
}
