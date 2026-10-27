import { apiRequest } from '../../../api/client';
import { entregaSchema, respuestaIngresoSchema } from '../schemas/ingresos.schema';

export const recepcion = (token: string, id: string) => apiRequest(`/api/ingresos/recepciones/${id}`, entregaSchema, {}, token);
/** Contratos específicos: no se admiten acciones posteriores mediante un formulario genérico. */
export const registrarExterno = (token: string, datos: unknown) => apiRequest('/api/ingresos/externos', respuestaIngresoSchema, { method: 'POST', body: JSON.stringify(datos) }, token);
export const recibirEIngresar = (token: string, id: string, datos: unknown) => apiRequest(`/api/ingresos/recepciones/${id}`, respuestaIngresoSchema, { method: 'POST', body: JSON.stringify(datos) }, token);
export const formalizarRecibido = (token: string, id: string, datos: unknown) => apiRequest(`/api/ingresos/recibidos/${id}`, respuestaIngresoSchema, { method: 'POST', body: JSON.stringify(datos) }, token);

import { historiaSchema, actuacionesSchema, operacionSchema } from '../schemas/ingresos.schema';
export const historia = (token: string, id: string, pagina: number) => apiRequest(`/api/ingresos/documentos/${id}/historia?pagina=${pagina}`, historiaSchema, {}, token);
export const actuaciones = (token: string, id: string, ingreso: string, pagina: number) => apiRequest(`/api/ingresos/documentos/${id}/ingresos/${ingreso}/actuaciones?pagina=${pagina}`, actuacionesSchema, {}, token);
export type AccionIngreso = 'continuaciones' | 'evidencias' | 'conclusion' | 'invalidacion' | 'reingresos';
export const operar = (token: string, id: string, ingreso: string, accion: AccionIngreso, datos: unknown) => apiRequest(
 `/api/ingresos/documentos/${id}/${accion === 'reingresos' ? 'reingresos' : `ingresos/${ingreso}/${accion}`}`, operacionSchema, { method:'POST', body:JSON.stringify(datos) },token);

import { auditoriaSchema } from '../schemas/ingresos.schema';
export const auditoria = (token:string,id:string,pagina:number)=>apiRequest(`/api/ingresos/documentos/${id}/auditoria?pagina=${pagina}`,auditoriaSchema,{},token);
