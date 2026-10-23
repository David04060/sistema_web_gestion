import { createContext } from 'react';
import type { AccesoSiseve } from '../schemas/acceso.schema';
export interface ConsultaAccesoSiseve {
    datos: AccesoSiseve | null;
    cargando: boolean;
    error: string;
    recargar: () => void;
}
export const AccesoSiseveContext = createContext<ConsultaAccesoSiseve | null>(null);
