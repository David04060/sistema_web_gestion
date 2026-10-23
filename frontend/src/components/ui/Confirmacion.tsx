import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './Confirmacion.module.css';
import admin from './Admin.module.css';
/** Modal nativo: mantiene el foco dentro, permite cancelar y bloquea doble confirmación mientras guarda. */
export function Confirmacion({ titulo, children, ocupado, confirmar, cancelar }: {
    titulo: string;
    children: ReactNode;
    ocupado: boolean;
    confirmar: () => void;
    cancelar: () => void;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const id = useId();
    useEffect(/** Abre el diálogo de confirmación y prepara su cierre al desmontarse. */() => {
        const dialog = ref.current;
        dialog?.showModal();
        return /** Cierra el diálogo al retirar el componente para liberar el foco modal. */ () => {
            dialog?.close();
        };
    }, []);
    return <dialog ref={ref} className={styles.dialogo} aria-labelledby={id} onCancel={/** Intercepta Escape y permite cancelar únicamente si no hay una escritura en curso. */ event => {
        event.preventDefault();
        if (!ocupado)
            cancelar();
    }}>
        <h2 id={id}>
            {titulo}
        </h2>
        <div>
            {children}
        </div>
        <div className={admin.acciones}>
            <button className={admin.secundario} onClick={cancelar} disabled={ocupado} autoFocus>Cancelar</button>
            <button className={admin.boton} onClick={confirmar} disabled={ocupado}>
                {ocupado ? 'Procesando…' : 'Confirmar'}
            </button>
        </div>
    </dialog>;
}
