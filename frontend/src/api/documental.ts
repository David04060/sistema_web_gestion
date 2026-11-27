/** Archivo: Agrupa las llamadas a la API y construye rutas de ubicaciones sin ciclos.
 */
import { z } from 'zod';
import { apiRequest } from './client';
import {
  id,
  cuentaSchema,
  oficinasSchema,
  rolesSchema,
  respuestaCambio,
  tiposSchema,
  unidadSchema,
  destinatariosSchema,
  ubicacionesElegiblesSchema,
  auditoriaSchema,
  listaSchema,
  detalleSchema,
  historialSchema,
  opcionesSchema,
  dashboardSchema,
  type FiltroUbicaciones,
} from './documental.schemas';
export * from './documental.schemas';

/** Consultas administrativas: reciben el comprobante de sesión y devuelven datos validados.
 * guardar envía los campos y el método de escritura; los permisos se comprueban en la API. */
export const config = {
  usuarios: (t: string) => apiRequest('/api/usuarios', z.object({ usuarios: z.array(cuentaSchema) }), {}, t),
  usuario: (t: string, u: string) =>
    apiRequest('/api/usuarios/' + encodeURIComponent(u), z.object({ usuario: cuentaSchema }), {}, t),
  roles: (t: string) => apiRequest('/api/roles', rolesSchema, {}, t),
  oficinas: (t: string) => apiRequest('/api/oficinas', oficinasSchema, {}, t),
  oficina: (t: string, id: string) =>
    apiRequest(
      '/api/oficinas/' + encodeURIComponent(id),
      z.object({ oficina: z.object({ id: z.string(), nombre: z.string(), activa: z.boolean() }) }),
      {},
      t,
    ),
  relevo: (t: string, oficina: string) =>
    apiRequest(
      '/api/oficinas/' + encodeURIComponent(oficina) + '/relevo',
      z.object({
        responsable: z.object({ id, nombre: z.string(), version_autenticacion: z.number().int() }).nullable(),
        candidatos: z.array(z.object({ id, nombre: z.string(), version_autenticacion: z.number().int() })),
      }),
      {},
      t,
    ),
  tipos: (t: string) => apiRequest('/api/tipos-documentales', tiposSchema, {}, t),
  unidades: (t: string, u?: string) =>
    apiRequest(
      '/api/ubicaciones' + (u ? '?usuario_id=' + encodeURIComponent(u) : ''),
      z.object({ unidades: z.array(unidadSchema) }),
      {},
      t,
    ),
  guardar: (t: string, ruta: string, v: unknown, metodo = 'POST') =>
    apiRequest('/api/' + ruta, respuestaCambio, { method: metodo, body: JSON.stringify(v) }, t),
};
/** Solicitudes documentales: IDs como texto y respuestas comprobadas con los esquemas públicos.
 * Las búsquedas permiten cancelar solicitudes antiguas. Las escrituras devuelven el detalle actualizado. */
export const api = {
  // Los selectores reciben texto de búsqueda y una señal para descartar solicitudes anteriores.
  origenes: (token: string, q: string, signal: AbortSignal) =>
    apiRequest(
      '/api/documentos/origenes?' + new URLSearchParams({ q }),
      z.object({
        documentos: z.array(z.object({ id, codigo_visible: z.string(), asunto: z.string() })),
        hay_mas: z.boolean(),
      }),
      { signal },
      token,
    ),
  buscarUbicaciones: (token: string, q: string, signal: AbortSignal, filtro?: FiltroUbicaciones) =>
    apiRequest(
      '/api/documentos/ubicaciones?' + new URLSearchParams({ q, ...filtro }),
      ubicacionesElegiblesSchema,
      { signal },
      token,
    ),
  destinatarios: (token: string, q: string, oficina: string, signal: AbortSignal) => {
    const filtros = new URLSearchParams({ q });
    if (oficina) filtros.set('oficina_id', oficina);
    return apiRequest('/api/documentos/destinatarios?' + filtros, destinatariosSchema, { signal }, token);
  },
  auditoria: (t: string, d: string) =>
    apiRequest('/api/documentos/' + encodeURIComponent(d) + '/auditoria', auditoriaSchema, {}, t),
  lista: (t: string, q: string) => apiRequest('/api/documentos' + (q ? '?' + q : ''), listaSchema, {}, t),
  detalle: (t: string, d: string) =>
    apiRequest('/api/documentos/' + encodeURIComponent(d), detalleSchema, {}, t),
  historial: (t: string, d: string) =>
    apiRequest('/api/documentos/' + encodeURIComponent(d) + '/historial', historialSchema, {}, t),
  opciones: (t: string) => apiRequest('/api/documentos/opciones', opcionesSchema, {}, t),
  // Las entradas de escritura se validan en el servidor. Correcciones y decisiones incluyen la revisión.
  registrar: (t: string, v: unknown) =>
    apiRequest('/api/documentos', detalleSchema, { method: 'POST', body: JSON.stringify(v) }, t),
  corregir: (t: string, d: string, v: unknown) =>
    apiRequest(
      '/api/documentos/' + encodeURIComponent(d),
      detalleSchema,
      { method: 'PUT', body: JSON.stringify(v) },
      t,
    ),
  delegar: (t: string, d: string, v: unknown) =>
    apiRequest(
      '/api/documentos/' + encodeURIComponent(d) + '/delegar',
      detalleSchema,
      { method: 'POST', body: JSON.stringify(v) },
      t,
    ),
  ubicar: (t: string, d: string, v: unknown) =>
    apiRequest(
      '/api/documentos/' + encodeURIComponent(d) + '/ubicacion',
      detalleSchema,
      { method: 'POST', body: JSON.stringify(v) },
      t,
    ),
  anular: (t: string, d: string, v: unknown) =>
    apiRequest(
      '/api/documentos/' + encodeURIComponent(d) + '/anular',
      z.object({ anulado: z.boolean() }),
      { method: 'POST', body: JSON.stringify(v) },
      t,
    ),
  dashboard: (t: string) => apiRequest('/api/dashboard', dashboardSchema, {}, t),
};
/** Recibe el catálogo y una unidad; devuelve su ruta desde la raíz sin repetir nodos si hay un ciclo. */
export function rutaUnidades(
  unidades: Array<{
    id: string;
    padre_id: string | null;
    clase: string;
    nombre: string;
  }>,
  unidad: string,
): string {
  const partes: string[] = [],
    visitados = new Set<string>();
  let actual = unidades.find((u) => u.id === unidad);
  while (actual && !visitados.has(actual.id)) {
    visitados.add(actual.id);
    partes.unshift(
      !actual.padre_id && actual.clase !== 'Lugar' ? actual.clase + ': ' + actual.nombre : actual.nombre,
    );
    actual = actual.padre_id ? unidades.find((u) => u.id === actual!.padre_id) : undefined;
  }
  return partes.join(' / ');
}
/** Excluye la unidad editada y sus descendientes para que el formulario no ofrezca un padre circular. */
export function padresElegibles<
  T extends {
    id: string;
    padre_id: string | null;
  },
>(unidades: T[], actual?: string) {
  if (!actual) return unidades;
  const excluidos = new Set([actual]);
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const u of unidades)
      if (u.padre_id && excluidos.has(u.padre_id) && !excluidos.has(u.id)) {
        excluidos.add(u.id);
        cambio = true;
      }
  }
  return unidades.filter((u) => !excluidos.has(u.id));
}
