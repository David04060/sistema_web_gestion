import { useCallback, type ReactNode } from 'react';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { acceso } from '../api/acceso.api';
import { AccesoSiseveContext } from './AccesoSiseveContext';
/** Comparte una consulta del permiso propio por montaje autenticado, sin guardar claves ni contenido. */
export function AccesoSiseveProvider({ children }: {
    children: ReactNode;
}) {
    const token = useAuth().sesion!.token;
    const consulta = useConsulta(useCallback(/** Consulta únicamente metadatos de acceso propio; no descarga contenido ni verifica la clave adicional. */() => acceso(token), [token]));
    return <AccesoSiseveContext.Provider value={consulta}>
        {children}
    </AccesoSiseveContext.Provider>;
}
