import { useContext } from 'react';
import { AccesoSiseveContext } from '../context/AccesoSiseveContext';
/** Solo consulta metadatos compartidos; cada operación continúa autorizándose en Express. */
export function useAccesoSiseve() {
    const consulta = useContext(AccesoSiseveContext);
    if (!consulta)
        throw new Error('useAccesoSiseve requiere el layout autenticado');
    return consulta;
}
