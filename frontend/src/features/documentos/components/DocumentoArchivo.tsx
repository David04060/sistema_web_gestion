import { useCallback, useRef, useState } from 'react';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import * as api from '../api/documentos.api';
import styles from '../../../components/ui/Admin.module.css';

/** Vinculación individual: preserva entradas ante fallos y no ofrece cambio ni desvinculación. */
export function DocumentoArchivo({ token, id, actualizar }: { token: string; id: string; actualizar: () => void }) {
    const consulta = useConsulta(useCallback(() => api.archivosDisponibles(token), [token]));
    const [archivo, setArchivo] = useState('');
    const [fundamento, setFundamento] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState('');
    const mensaje = useRef<HTMLParagraphElement>(null);
    const bloqueo = useRef(false);
    return <section className={styles.tarjeta} aria-labelledby="titulo-vinculacion">
        <h2 id="titulo-vinculacion">Clasificar en un archivo institucional</h2>
        <p>Solo el registrador original que conserva la custodia puede realizar esta vinculación. El código, la autoría y la ubicación se conservan. Esta operación no permite cambiar de archivo posteriormente.</p>
        <EstadoCarga {...consulta} reintentar={consulta.recargar} />
        {consulta.datos && (!consulta.datos.archivos.length ? <p role="status">Solicite al Administrador la asignación de un archivo institucional para clasificar este documento.</p> : <form onSubmit={async e => {
            e.preventDefault();
            if (bloqueo.current) return;
            bloqueo.current = true;
            setEnviando(true);
            setError('');
            try {
                await api.vincularArchivo(token, id, { archivo_id: archivo, fundamento: fundamento.trim() });
                actualizar();
            } catch (e) {
                setError(e instanceof Error ? e.message : 'No se pudo vincular el documento');
                requestAnimationFrame(() => mensaje.current?.focus());
            } finally { bloqueo.current = false; setEnviando(false); }
        }}>
            <div className={styles.campo}>
                <label htmlFor="vincular-archivo">Archivo institucional asignado</label>
                <select id="vincular-archivo" value={archivo} onChange={e => setArchivo(e.target.value)} required>
                    <option value="">Seleccione</option>
                    {consulta.datos.archivos.map(a => <option key={a.id} value={a.id}>{a.nombre} · {a.oficina}</option>)}
                </select>
            </div>
            <div className={styles.campo}>
                <label htmlFor="fundamento-archivo">Motivo o fundamento de la vinculación</label>
                <textarea id="fundamento-archivo" value={fundamento} onChange={e => setFundamento(e.target.value)} required maxLength={1000} />
            </div>
            {error && <p role="alert" tabIndex={-1} ref={mensaje} className={styles.error}>{error}</p>}
            <button className={styles.boton} disabled={enviando}>{enviando ? 'Vinculando…' : 'Vincular documento al archivo'}</button>
        </form>)}
    </section>;
}
