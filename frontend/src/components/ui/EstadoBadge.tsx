import styles from './EstadoBadge.module.css';
import { etiquetasEstado } from '../../lib/estados-documentales';
const tonos: Readonly<Record<string, string>> = {
    PENDIENTE_DECISION: 'advertencia',
    EN_TRASLADO: 'info',
    RECIBIDO: 'exito',
    RECHAZADO: 'error',
    CANCELADO: 'neutro',
};
/** Traduce solo la presentación del estado, conservando su valor y las reglas de negocio. */
export function EstadoBadge({ estado }: {
    estado: string;
}) {
    return <span className={`${styles.badge} ${styles[tonos[estado] ?? 'neutro']}`}>
        {etiquetasEstado[estado] ?? estado}
    </span>;
}
