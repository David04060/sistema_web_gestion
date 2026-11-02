import {Link} from 'react-router-dom';
import styles from '../../../components/ui/Admin.module.css';

/** Entrada única; la clasificación se elige dentro del formulario. */
export function RegistroDocumentoOpciones({origenId}:{origenId?:string} = {}) {
    return <div className={styles.acciones} aria-label="Opciones de registro documental">
        <Link className={styles.boton} to={`/documentos/nuevo${origenId?`?origen=${encodeURIComponent(origenId)}`:''}`}>Registrar documento</Link>
    </div>;
}
