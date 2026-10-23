import { z } from 'zod';
import { apiRequest } from '../../../api/client';
import { tipoSchema, formularioTipoSchema } from '../schemas/tipos.schema';
const base = '/api/tipos-documentales';
/**
 * Consulta el listado mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param token - JWT de la sesión vigente; no se envía en la URL.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const listar = (token: string) => apiRequest(base, z.object({ tipos: z.array(tipoSchema) }), {}, token);
/**
 * Consulta el detalle mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param token - JWT de la sesión vigente; no se envía en la URL.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const detalle = (token: string, id: string) => apiRequest(`${base}/${encodeURIComponent(id)}`, z.object({ tipo: tipoSchema }), {}, token);
/** Valida la respuesta de escritura antes de navegar al detalle. */
export const guardar = (token: string, datos: z.output<typeof formularioTipoSchema>, id?: string) => apiRequest(id ? `${base}/${encodeURIComponent(id)}` : base, z.object({ tipo: tipoSchema }), { method: id ? 'PUT' : 'POST', body: JSON.stringify(datos) }, token);
