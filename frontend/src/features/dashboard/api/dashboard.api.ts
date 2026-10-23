import { apiRequest } from '../../../api/client';
import { dashboardSchema } from '../schemas/dashboard.schema';
/** Consulta autenticada; el backend determina el alcance usando permisos vigentes. */
export const consultarDashboard = (token: string) => apiRequest('/api/dashboard', dashboardSchema, { cache: 'no-store' }, token);
