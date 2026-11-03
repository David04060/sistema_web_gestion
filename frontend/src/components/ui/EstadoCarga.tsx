import styles from './Admin.module.css';
import {Esqueleto} from './Esqueleto';
/** Estado de consultas reutilizable: no sustituye datos vacíos ni oculta errores de red. */
export function EstadoCarga({ cargando, error, reintentar, tipo='lista', actualizando=false }: {
    cargando: boolean;
    error: string;
    reintentar: () => void;
    tipo?: 'lista'|'dashboard'|'detalle'|'pdf';
    actualizando?: boolean;
}) {
    if (cargando)
        return <Esqueleto tipo={tipo}/>;
    return error ? <div className={styles.error} role="alert">
        <p>
            {error}
        </p>
        <button className={styles.secundario} onClick={reintentar}>Reintentar</button>
    </div> : actualizando ? <p className={styles.carga} role="status">Actualizando información…</p> : null;
}
