import type { EstadoPdf } from '../api/pdf.api';
import styles from './ArchivoPdf.module.css';
/** Solo presenta capacidades devueltas por GET /pdf; el servidor autoriza cada operación. */
export function ResumenPdf({ estado, ocupado, seleccionar, abrir }: {
    estado: EstadoPdf;
    ocupado: boolean;
    seleccionar: () => void;
    abrir: () => void;
}) {
    return estado.archivo ? <div className={styles.resumen}><p>{estado.archivo.nombre}</p><button type="button" disabled={ocupado} onClick={abrir}>Visualizar archivo PDF</button></div> : <><p>Sin PDF adjunto</p>{estado.modificar && <button type="button" disabled={ocupado} onClick={seleccionar}>Subir archivo PDF</button>}</>;
}
export function HerramientasPdf({ modificar, ocupado, volver, descargar, seleccionar, eliminar }: {
    modificar: boolean;
    ocupado: boolean;
    volver: () => void;
    descargar: () => void;
    seleccionar: () => void;
    eliminar: () => void;
}) {
    return <div className={styles.herramientas}><button type="button" onClick={volver}>Volver al documento</button><button type="button" disabled={ocupado} onClick={descargar}>Descargar PDF</button>{modificar && <><button type="button" disabled={ocupado} onClick={seleccionar}>Actualizar/Reemplazar PDF</button><button className={styles.peligro} type="button" disabled={ocupado} onClick={eliminar}>Eliminar PDF</button></>}</div>;
}
