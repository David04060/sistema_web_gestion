import { z } from 'zod';
import { apiRequest } from '../../../api/client';
import { detalleDocumentoSchema, opcionesSchema, listaDocumentosSchema, historialSchema } from '../schemas/documentos.schema';
/**
 * Consulta el listado mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param token - JWT de la sesión vigente; no se envía en la URL.
 * @param filtros - Filtros validados de búsqueda y paginación.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const listar = (token: string, filtros: string) => apiRequest(`/api/documentos?${filtros}`, listaDocumentosSchema, {}, token);
/**
 * Consulta el detalle mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param token - JWT de la sesión vigente; no se envía en la URL.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const detalle = (token: string, id: string) => apiRequest(`/api/documentos/${encodeURIComponent(id)}`, detalleDocumentoSchema, {}, token);
/**
 * Consulta el historial autorizado mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param token - JWT de la sesión vigente; no se envía en la URL.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const historial = (token: string, id: string) => apiRequest(`/api/documentos/${encodeURIComponent(id)}/historial`, z.object({ historial: z.array(historialSchema) }), {}, token);
/**
 * Consulta las opciones disponibles mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param token - JWT de la sesión vigente; no se envía en la URL.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const opciones = (token: string) => apiRequest('/api/documentos/opciones', opcionesSchema, {}, token);
/** Cada escritura se valida contra el mismo contrato de detalle que la consulta. */
export const guardar = (token: string, id: string | undefined, datos: unknown) => apiRequest(id ? `/api/documentos/${id}` : '/api/documentos', detalleDocumentoSchema, { method: id ? 'PUT' : 'POST', body: JSON.stringify(datos) }, token);
/**
 * Ejecuta la operación documental seleccionada mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param token - JWT de la sesión vigente; no se envía en la URL.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param operacion - Acción que se ejecuta con los contratos y permisos del módulo.
 * @param datos - Datos de entrada según el contrato tipado de esta operación.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const operar = (token: string, id: string, operacion: string, datos: unknown) => apiRequest(`/api/documentos/${id}/${operacion}`, detalleDocumentoSchema, { method: 'POST', body: JSON.stringify(datos) }, token);
