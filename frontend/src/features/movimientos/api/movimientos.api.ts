import { z } from 'zod';
import { apiRequest } from '../../../api/client';
import { listaMovimientosSchema, movimientoSchema } from '../schemas/movimientos.schema';
/**
 * Consulta el listado mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param token - JWT de la sesión vigente; no se envía en la URL.
 * @param filtros - Filtros validados de búsqueda y paginación.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const listar = (token: string, filtros: string) => apiRequest(`/api/movimientos?${filtros}`, listaMovimientosSchema, {}, token);
/**
 * Consulta el detalle mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param token - JWT de la sesión vigente; no se envía en la URL.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const detalle = (token: string, id: string) => apiRequest(`/api/movimientos/${encodeURIComponent(id)}`, z.object({ movimiento: movimientoSchema }), {}, token);
/**
 * Confirma la salida física mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param token - JWT de la sesión vigente; no se envía en la URL.
 * @param datos - Datos de entrada según el contrato tipado de esta operación.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const derivar = (token: string, datos: unknown) => apiRequest('/api/movimientos', z.object({ movimiento: movimientoSchema }), { method: 'POST', body: JSON.stringify(datos) }, token);
/**
 * Ejecuta la operación documental seleccionada mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param token - JWT de la sesión vigente; no se envía en la URL.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param operacion - Acción que se ejecuta con los contratos y permisos del módulo.
 * @param datos - Datos de entrada según el contrato tipado de esta operación.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const operar = (token: string, id: string, operacion: string, datos: unknown) => apiRequest(`/api/movimientos/${id}/${operacion}`, z.object({ movimiento: movimientoSchema }), { method: 'POST', body: JSON.stringify(datos) }, token);
