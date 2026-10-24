import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { observarRegreso } from '../../../lib/regresoVisible';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { acceso } from '../api/acceso.api';
import { AccesoSiseveContext } from './AccesoSiseveContext';
/** Comparte una consulta del permiso propio por montaje autenticado, sin guardar claves ni contenido. */
export function AccesoSiseveProvider({ children }: {
    children: ReactNode;
}) {
    const { sesion, revalidando } = useAuth();
    const token = sesion!.token;
    const [regreso, setRegreso] = useState(0);
    const [visible, setVisible] = useState(document.visibilityState === 'visible');
    const location = useLocation();
    const ruta = location.pathname.startsWith('/siseve') ? location.pathname : '';
    useEffect(() => observarRegreso(() => { setVisible(true); setRegreso(r => r + 1); },
        () => { setVisible(false); setRegreso(r => r + 1); }), []);
    const consulta = useConsulta(useCallback(() => acceso(token), [token, regreso, ruta]),
        { restringida: true, habilitada: visible && !revalidando });
    return <AccesoSiseveContext.Provider value={consulta}>
        {children}
    </AccesoSiseveContext.Provider>;
}
