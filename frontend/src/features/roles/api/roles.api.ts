import { z } from 'zod';
import { apiRequest } from '../../../api/client';
import { registroCatalogoSchema, detalleCatalogoSchema, guardarCatalogoRespuestaSchema } from '../../../lib/catalogo.schema';
/** Adaptador del módulo roles; cada respuesta se valida antes de llegar a las páginas. */
export const api = {
    /**
     * Consulta el listado mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
     * @param token - JWT de la sesión vigente; no se envía en la URL.
     * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
     */
    async listar(token: string) {
        return (await apiRequest('/api/roles', z.object({ roles: z.array(registroCatalogoSchema) }), {}, token)).roles;
    },
    /**
     * Consulta el detalle mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
     * @param token - JWT de la sesión vigente; no se envía en la URL.
     * @param id - Identificador textual del registro al que se aplica esta operación.
     * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
     */
    detalle(token: string, id: string) {
        return apiRequest('/api/roles/' + encodeURIComponent(id), detalleCatalogoSchema, {}, token);
    },
    /**
     * Crea o actualiza el registro mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
     * @param token - JWT de la sesión vigente; no se envía en la URL.
     * @param nombre - Denominación del registro que se consulta o conserva.
     * @param id - Identificador textual del registro al que se aplica esta operación.
     * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
     */
    guardar(token: string, nombre: string, id?: string) {
        return apiRequest('/api/roles' + (id ? '/' + encodeURIComponent(id) : ''), guardarCatalogoRespuestaSchema, { method: id ? 'PUT' : 'POST', body: JSON.stringify({ nombre }) }, token);
    },
};
