import { apiRequest } from '../../../api/client';
import { accesoSchema } from '../schemas/acceso.schema';
/** Transporte mínimo del layout, separado de los contratos documentales restringidos. */
export const acceso = (token: string) => apiRequest('/api/siseve/acceso', accesoSchema, {}, token);
