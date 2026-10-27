import { apiRequest } from '../../../api/client';
import { listaSchema, respuestaSchema, historialSchema, type Crear, type Metadatos } from '../schemas/archivos.schema';
const ruta = (id: string) => '/api/archivos/' + encodeURIComponent(id);
/** El cliente compartido verifica Bearer, sesión y contrato de cada respuesta. */
export const listar = (token: string, filtros: string) => apiRequest('/api/archivos?' + filtros, listaSchema, {}, token);
export const detalle = (token: string, id: string) => apiRequest(ruta(id), respuestaSchema, {}, token);
export const crear = (token: string, datos: Crear) => apiRequest('/api/archivos', respuestaSchema, { method: 'POST', body: JSON.stringify(datos) }, token);
/** Selección explícita para no enviar referencias ni fechas en una corrección. */
export const corregir = (token: string, id: string, { nombre, responsabilidad, motivo }: Metadatos) =>
    apiRequest(ruta(id), respuestaSchema, { method: 'PUT', body: JSON.stringify({ nombre, responsabilidad, motivo }) }, token);
export const asignaciones = (token: string, id: string, filtros: string) => apiRequest(ruta(id) + '/asignaciones?' + filtros, historialSchema, {}, token);
