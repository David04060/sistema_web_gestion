import {useId, useState} from 'react';
import styles from './Admin.module.css';

export function TextoExpandible({texto, limite = 220}: {texto: string; limite?: number}) {
    const [abierto, setAbierto] = useState(false);
    const id = useId();
    const extenso = texto.length > limite;
    return <div className={styles.textoExpandible}><span id={id} className={extenso && !abierto ? styles.textoResumido : undefined}>{texto}</span>{extenso && <button className={styles.leerMas} type="button" aria-expanded={abierto} aria-controls={id} onClick={() => setAbierto(v => !v)}>{abierto ? 'Leer menos' : 'Leer más'}</button>}</div>;
}
