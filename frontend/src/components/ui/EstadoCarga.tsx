import styles from './Admin.module.css';
/** Estado de consultas reutilizable: no sustituye datos vacíos ni oculta errores de red. */
export function EstadoCarga({ cargando, error, reintentar }: {
    cargando: boolean;
    error: string;
    reintentar: () => void;
}) {
    if (cargando)
        return <p role="status" className={styles.carga}>Cargando información…</p>;
    return error ? <div className={styles.error} role="alert">
        <p>
            {error}
        </p>
        <button className={styles.secundario} onClick={reintentar}>Reintentar</button>
    </div> : null;
}
