import { z } from 'zod';
import { apiRequest } from '../../../api/client';
import { listaUsuariosSchema, respuestaUsuarioSchema, type CrearUsuario, type DatosUsuario } from '../schemas/usuarios.schema';
/** Transporte específico del módulo: separa consulta, edición personal, estado y contraseña. */
const ruta = (id: string) => `/api/usuarios/${encodeURIComponent(id)}`;
/**
 * Consulta el listado mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param token - JWT de la sesión vigente; no se envía en la URL.
 * @param filtros - Filtros validados de búsqueda y paginación.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const listar = (token: string, filtros: string) => apiRequest(`/api/usuarios?${filtros}`, listaUsuariosSchema, {}, token);
/**
 * Consulta el detalle mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param token - JWT de la sesión vigente; no se envía en la URL.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const detalle = (token: string, id: string) => apiRequest(ruta(id), respuestaUsuarioSchema, {}, token);
/**
 * Crea el registro mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param token - JWT de la sesión vigente; no se envía en la URL.
 * @param datos - Datos de entrada según el contrato tipado de esta operación.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const crear = (token: string, datos: CrearUsuario) => apiRequest('/api/usuarios', respuestaUsuarioSchema, { method: 'POST', body: JSON.stringify(datos) }, token);
/**
 * Edita el registro mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param token - JWT de la sesión vigente; no se envía en la URL.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param datos - Datos de entrada según el contrato tipado de esta operación.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const editar = (token: string, id: string, datos: DatosUsuario) => apiRequest(ruta(id), respuestaUsuarioSchema, { method: 'PUT', body: JSON.stringify(datos) }, token);
/**
 * Cambia la actividad de la cuenta mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param token - JWT de la sesión vigente; no se envía en la URL.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param activo - Condición de actividad solicitada.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const cambiarEstado = (token: string, id: string, activo: boolean) => apiRequest(`${ruta(id)}/estado`, respuestaUsuarioSchema, { method: 'PATCH', body: JSON.stringify({ activo }) }, token);
/** La nueva contraseña se envía solo al endpoint administrativo y nunca se conserva en almacenamiento. */
export const restablecer = (token: string, id: string, contrasena: string) => apiRequest(`${ruta(id)}/contrasena`, z.object({ mensaje: z.string() }), { method: 'PUT', body: JSON.stringify({ contrasena }) }, token);
