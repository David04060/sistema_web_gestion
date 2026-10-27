import base from '../../../components/ui/Admin.module.css';
import styles from '../styles/Archivos.module.css';

/** Pagina únicamente en el servidor; los números de página no son identificadores. */
export function PaginacionArchivos({ total, pagina, limite, nombre, cambiar }: {
    total: number; pagina: number; limite: number; nombre: string;
    cambiar: (pagina: number, limite: number) => void;
}) {
    return <div className={styles.paginacion}>
        <p role="status">{total} {nombre} · Página {pagina}</p>
        <label>Por página <select aria-label={`Cantidad por página de ${nombre}`} value={limite} onChange={e => cambiar(1, parseInt(e.target.value, 10))}>
            {[...new Set([limite, 10, 25, 50])].sort((a, b) => a - b).map(n => <option key={n} value={n}>{n}</option>)}
        </select></label>
        <nav aria-label={`Paginación de ${nombre}`}>
            <button className={base.secundario} disabled={pagina <= 1} onClick={() => cambiar(pagina - 1, limite)}>Anterior</button>
            <button className={base.secundario} disabled={pagina * limite >= total} onClick={() => cambiar(pagina + 1, limite)}>Siguiente</button>
        </nav>
    </div>;
}
