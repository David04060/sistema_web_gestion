import styles from './Admin.module.css';
/** Estado accesible para la descarga de una ruta; no verifica ni concede acceso. */
export function CargaRuta() {
    return <main className={styles.pagina}>
        <p role="status" aria-live="polite" className={styles.carga}>Cargando pantalla…</p>
    </main>;
}
