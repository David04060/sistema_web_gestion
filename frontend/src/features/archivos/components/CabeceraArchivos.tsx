import { useEffect, useRef, type ReactNode } from 'react';
import base from '../../../components/ui/Admin.module.css';
/** Anuncia la entrada a la pantalla sin alterar el foco durante la edición. */
export function CabeceraArchivos({ titulo, descripcion, children }: { titulo: string; descripcion: string; children?: ReactNode }) {
    const heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => { heading.current?.focus(); }, [titulo]);
    return <div className={base.titulo}><div><h1 tabIndex={-1} ref={heading}>{titulo}</h1><p>{descripcion}</p></div>{children}</div>;
}
