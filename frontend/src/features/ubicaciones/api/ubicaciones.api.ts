import { z } from 'zod';
import { apiRequest } from '../../../api/client';
import { estanteSchema, archivadorSchema, opcionesSchema, type DatosEstante, type DatosArchivador } from '../schemas/ubicaciones.schema';
const base = '/api/ubicaciones';
/**
 * Consulta las opciones disponibles mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param t - JWT vigente utilizado en la solicitud autenticada.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const opciones = (t: string) => apiRequest(`${base}/opciones`, opcionesSchema, {}, t);
/**
 * Consulta los estantes autorizados mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param t - JWT vigente utilizado en la solicitud autenticada.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const estantes = (t: string) => apiRequest(`${base}/estantes`, z.object({ estantes: z.array(estanteSchema) }), {}, t);
/**
 * Consulta los archivadores autorizados mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param t - JWT vigente utilizado en la solicitud autenticada.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const archivadores = (t: string) => apiRequest(`${base}/archivadores`, z.object({ archivadores: z.array(archivadorSchema) }), {}, t);
/**
 * Consulta el estante autorizado mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param t - JWT vigente utilizado en la solicitud autenticada.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const estante = (t: string, id: string) => apiRequest(`${base}/estantes/${encodeURIComponent(id)}`, z.object({ estante: estanteSchema, archivadores: z.array(archivadorSchema) }), {}, t);
/**
 * Consulta el archivador autorizado mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param t - JWT vigente utilizado en la solicitud autenticada.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const archivador = (t: string, id: string) => apiRequest(`${base}/archivadores/${encodeURIComponent(id)}`, z.object({ archivador: archivadorSchema }), {}, t);
/** Escrituras con contratos separados: la edición no traslada oficina ni estante padre. */
export const guardarEstante = (t: string, d: DatosEstante, id?: string) => apiRequest(`${base}/estantes${id ? `/${encodeURIComponent(id)}` : ''}`, z.object({ estante: estanteSchema }), { method: id ? 'PUT' : 'POST', body: JSON.stringify(d) }, t);
/**
 * Crea o actualiza el archivador mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param t - JWT vigente utilizado en la solicitud autenticada.
 * @param d - Datos tipados del registro o formulario de esta operación.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const guardarArchivador = (t: string, d: DatosArchivador, id?: string) => apiRequest(`${base}/archivadores${id ? `/${encodeURIComponent(id)}` : ''}`, z.object({ archivador: archivadorSchema }), { method: id ? 'PUT' : 'POST', body: JSON.stringify(d) }, t);
