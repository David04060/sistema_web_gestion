/** Archivo: Contratos de acciones, correcciones y recorrido del documento. */
import { z } from 'zod';
import { apiRequest } from '../../../api/client';
const accion = z.object({
  id: z.string(),
  responsable: z.string(),
  descripcion: z.string(),
  oficina_nombre: z.string().nullable(),
  creado_en: z.string(),
  revision: z.string(),
  pdf_nombre: z.string().nullable(),
  corregir: z.boolean(),
});
const cambio = z.object({ descripcion: z.string(), pdf_nombre: z.string().nullable() });
const evento = z.object({
  id: z.string(),
  tipo: z.enum(['REGISTRO', 'DELEGACION', 'ACCION', 'CORRECCION']),
  fecha: z.string(),
  responsable: z.string(),
  descripcion: z.string(),
  oficina: z.string().nullable().optional(),
  indicaciones: z.string().nullable().optional(),
  accion_id: z.string().optional(),
  pdf_nombre: z.string().nullable().optional(),
  anterior: cambio.optional(),
  posterior: cambio.optional(),
});
const respuesta = z.object({
  acciones: z.array(accion),
  eventos: z.array(evento),
  puede_agregar: z.boolean(),
});
export type AccionRealizada = z.infer<typeof accion>;
export type Atencion = z.infer<typeof respuesta>;
export const consultarAtencion = (token: string, id: string) =>
  apiRequest('/api/documentos/' + id + '/atencion', respuesta, {}, token);
export const guardarAccion = (token: string, id: string, accionId: string | undefined, datos: unknown) =>
  apiRequest(
    '/api/documentos/' + id + '/acciones' + (accionId ? '/' + accionId : ''),
    z.object({ id: z.string() }),
    { method: accionId ? 'PUT' : 'POST', body: JSON.stringify(datos) },
    token,
  );
export const prepararPdfAccion = (token: string, id: string, archivo: File) =>
  apiRequest(
    '/api/documentos/' + id + '/acciones/pdf/cargas',
    z.object({ carga: z.string(), url: z.url(), headers: z.record(z.string(), z.string()) }),
    {
      method: 'POST',
      body: JSON.stringify({ nombre: archivo.name, tamano: archivo.size, mime: 'application/pdf' }),
    },
    token,
  );
export const abrirPdfAccion = (token: string, id: string, accionId: string) =>
  apiRequest(
    '/api/documentos/' + id + '/acciones/' + accionId + '/pdf/abrir',
    z.object({ contenido: z.base64() }),
    { method: 'POST', body: '{}' },
    token,
  );
