import {Link} from 'react-router-dom';
import styles from '../../../components/ui/Admin.module.css';

/** Ambas entradas reutilizan el mismo formulario; el backend valida la clasificación. */
export function RegistroDocumentoOpciones({origenId}:{origenId?:string} = {}) {
    return <div className={styles.acciones} aria-label="Opciones de registro documental">
        <Link className={styles.boton} to={`/documentos/nuevo?clasificacion=RECIBIDO${origenId?`&origen=${encodeURIComponent(origenId)}`:''}`}>Registrar documento recibido</Link>
        <Link className={styles.boton} to={`/documentos/nuevo?clasificacion=EMITIDO${origenId?`&origen=${encodeURIComponent(origenId)}`:''}`}>Registrar documento emitido</Link>
    </div>;
}
