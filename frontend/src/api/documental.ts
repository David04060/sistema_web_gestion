import { z } from 'zod';
import { apiRequest } from './client';
export const id = z.string().regex(/^[1-9][0-9]*$/);
export const situacion = z.enum([
  'PENDIENTE_DIRECCION',
  'EN_MESA_DE_PARTES',
  'GUARDADO_DIRECCION',
  'PERSONAL',
  'DELEGADO',
  'ANULADO',
]);
export const situacionCuenta = z.enum([...situacion.options, 'EN_MI_OFICINA', 'DELEGADO_POR_MI', 'DELEGADO_A_MI']);
export const etiquetas: Record<string, string> = {
  PENDIENTE_DIRECCION: 'Pendiente de Dirección',
  EN_MESA_DE_PARTES: 'En Mesa de Partes',
  GUARDADO_DIRECCION: 'Guardado en Dirección',
  PERSONAL: 'Personal',
  DELEGADO: 'Delegado',
  EN_MI_OFICINA: 'En mi oficina',
  DELEGADO_POR_MI: 'Delegado por mí',
  DELEGADO_A_MI: 'Delegado a mí',
  ANULADO: 'Anulado',
};
export const documentoSchema = z.object({
  id,
  ambito_id: id,
  tipo_id: id,
  registrado_por: id,
  registrado_por_nombre: z.string(),
  delegado_por_nombre: z.string().nullable().optional(),
  registrado_por_oficina: z.string().nullable().optional(),
  tipo_nombre_guardado: z.string(),
  clasificacion: z.enum(['RECIBIDO', 'EMITIDO']),
  asunto: z.string(),
  remitente: z.string().nullable(),
  observaciones: z.string().nullable(),
  codigo_visible: z.string(),
  situacion,
  situacion_cuenta: situacionCuenta.optional(),
  revision: id,
  creado_en: z.string(),
  actualizado_en: z.string(),
  ubicacion_ruta: z.string().nullable().optional(),
});
export const permisosSchema = z.object({
  relacionar: z.boolean(),
  corregir: z.boolean(),
  anular: z.boolean(),
  delegar: z.boolean(),
  ubicar: z.boolean(),
  pdf: z.boolean(),
});
export const detalleSchema = z.object({
  documento: documentoSchema.extend({
    valores: z.array(z.object({ campo_id: id, nombre_guardado: z.string(), valor: z.string() })),
    delegacion: z
      .object({
        nombre_persona_guardado: z.string(),
        observaciones: z.string().nullable(),
        delegado_en: z.string(),
        actor: z.string(),
      })
      .nullable(),
    ubicacion: z
      .object({
        unidad_id: id,
        oficina_nombre_guardado: z.string(),
        ruta_ubicacion_guardada: z.string(),
        registrado_en: z.string(),
      })
      .nullable(),
    relacionados: z.array(
      z.object({ id, codigo_visible: z.string(), asunto: z.string(), origen_id: id.nullable() }),
    ),
    historico_solo_lectura: z.boolean().optional(),
    grupo: z.object({ primero_id:id.nullable(),inicio_visible:z.boolean(),documentos:z.array(z.object({id,codigo_visible:z.string(),asunto:z.string(),origen_id:id.nullable(),creado_en:z.string()})) }).optional(),
    permisos: permisosSchema,
  }),
});
export type DocumentoActual = z.infer<typeof detalleSchema>['documento'];
export const historialSchema = z.object({
  historial: z.array(
    z.object({
      id,
      accion: z.string(),
      motivo: z.string().nullable(),
      anterior: z.unknown(),
      posterior: z.unknown(),
      fecha: z.string(),
      actor: z.string(),
    }),
  ),
});
export const opcionesSchema = z.object({
  ambito_id: id,
  tipos: z.array(z.object({ id, nombre: z.string(), prefijo: z.string() })),
  oficinas: z.array(z.object({ id, nombre: z.string() })),
});
export type OpcionesActuales = z.infer<typeof opcionesSchema>;
export const unidadSchema = z.object({
  id,
  propietario_id: id,
  oficina_id: id,
  clase: z.string(),
  nombre: z.string(),
  padre_id: id.nullable(),
  activo: z.boolean(),
});
export const cuentaSchema = z.object({
  id,
  nombre: z.string(),
  apellido: z.string(),
  nombre_usuario: z.string(),
  email: z.string().nullable(),
  telefono: z.string().nullable(),
  activo: z.boolean(),
  rol_id: z.number().int(),
  oficina_id: id.nullable(),
  rol: z.string(),
  oficina: z.string().nullable(),
});
export type Cuenta = z.infer<typeof cuentaSchema>;
export const oficinasSchema = z.object({
  oficinas: z.array(z.object({ id, nombre: z.string(), activa: z.boolean() })),
});
export const rolesSchema = z.object({
  roles: z.array(z.object({ id: z.number().int(), nombre: z.string(), codigo: z.string() })),
});
export const respuestaCambio = z.object({ actualizado: z.boolean() }).or(z.object({ id }));
export const tiposSchema = z.object({
  tipos: z.array(z.object({ id, nombre: z.string(), prefijo: z.string(), activo: z.boolean(), editable: z.boolean().default(false), en_uso: z.boolean().default(true) })),
});
export const config = {
  usuarios: (t: string) =>
    apiRequest('/api/usuarios', z.object({ usuarios: z.array(cuentaSchema) }), {}, t),
  usuario: (t: string, u: string) =>
    apiRequest(
      '/api/usuarios/' + encodeURIComponent(u),
      z.object({ usuario: cuentaSchema }),
      {},
      t,
    ),
  roles: (t: string) => apiRequest('/api/roles', rolesSchema, {}, t),
  oficinas: (t: string) => apiRequest('/api/oficinas', oficinasSchema, {}, t),
  oficina: (t: string, id: string) =>
    apiRequest(
      '/api/oficinas/' + encodeURIComponent(id),
      z.object({ oficina: z.object({ id: z.string(), nombre: z.string(), activa: z.boolean() }) }),
      {},
      t,
    ),
  relevo: (t:string,oficina:string) => apiRequest('/api/oficinas/'+encodeURIComponent(oficina)+'/relevo',z.object({responsable:z.object({id,nombre:z.string(),version_autenticacion:z.number().int()}).nullable(),candidatos:z.array(z.object({id,nombre:z.string(),version_autenticacion:z.number().int()}))}),{},t),
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
export const listaSchema = z.object({
  documentos: z.array(documentoSchema),
  total: z.number().int(),
  pagina: z.number().int(),
  limite: z.number().int(),
});
const conteoEstadistico = z.object({ etiqueta: z.string(), total: z.number().int().nonnegative() });
const contextoEstadistico = {
  actualizado: z.string().datetime(),
  zona_horaria: z.literal('America/Lima'),
  periodo: z.object({
    desde: z.string().datetime(),
    hasta: z.string().datetime(),
    mes_actual_parcial: z.boolean(),
  }),
};
const administracionEstadistica = z.object({
  cuentas_por_rol: z.array(conteoEstadistico),
  actividad_cuentas: z.array(conteoEstadistico),
  actividad_oficinas: z.array(conteoEstadistico),
});
const grupoEstadistico = z.object({
  clave: z.string(),
  etiqueta: z.string(),
  total: z.number().int().nonnegative(),
  vigentes: z.number().int().nonnegative(),
  anulados: z.number().int().nonnegative(),
  situaciones: z.array(conteoEstadistico),
  tipos: z.array(conteoEstadistico),
  meses: z.array(
    z.object({
      mes: z.string().regex(/^\d{4}-\d{2}$/),
      total: z.number().int().nonnegative(),
      vigentes: z.number().int().nonnegative(),
      anulados: z.number().int().nonnegative(),
    }),
  ),
});
export const estadisticasDocumentalesSchema = z
  .object({
    ...contextoEstadistico,
    grupos_documentales: z.array(grupoEstadistico),
    administracion: administracionEstadistica.optional(),
  })
  .strict();
export const estadisticasAdministrativasSchema = z
  .object({ ...contextoEstadistico, administracion: administracionEstadistica })
  .strict();
export type EstadisticasDashboard =
  | z.infer<typeof estadisticasDocumentalesSchema>
  | z.infer<typeof estadisticasAdministrativasSchema>;
export const dashboardSchema = z.discriminatedUnion('alcance', [
  z
    .object({
      alcance: z.literal('administrativo'),
      usuarios: z.number(),
      oficinas: z.number(),
      estadisticas: estadisticasAdministrativasSchema.optional(),
    })
    .strict(),
  z.object({
    alcance: z.literal('global'),
    usuarios: z.number(),
    oficinas: z.number(),
    documentos: z.array(z.object({ situacion, total: z.number() })).optional(),
    estadisticas: estadisticasDocumentalesSchema.optional(),
  }),
  z.object({
    alcance: z.enum(['personal', 'institucional']),
    estados: z.array(z.object({ situacion: situacionCuenta, total: z.number() })),
    recientes: z.array(
      z.object({
        id,
        codigo_visible: z.string(),
        asunto: z.string(),
        situacion: situacionCuenta,
        creado_en: z.string(),
      }),
    ),
    estadisticas: estadisticasDocumentalesSchema.optional(),
  }),
]);
export const auditoriaSchema = z.object({
  eventos: z.array(
    z.object({
      id: z.string(),
      accion: z.string(),
      actor: z.string().nullable(),
      fecha: z.string(),
      motivo: z.string().nullable(),
      datos: z.array(
        z.object({
          campo: z.string(),
          anterior: z.string().nullable(),
          posterior: z.string().nullable(),
        }),
      ),
    }),
  ),
});
const destinatariosSchema = z.object({
  personas: z.array(z.object({
    id, nombre: z.string(), nombre_usuario: z.string(), oficina: z.string().nullable(),
  })),
  hay_mas: z.boolean(),
});
const ubicacionElegibleSchema = z.object({ id, ruta: z.string() });
export type UbicacionElegible = z.infer<typeof ubicacionElegibleSchema>;
const ubicacionesElegiblesSchema = z.object({
  ubicaciones: z.array(ubicacionElegibleSchema),
  hay_mas: z.boolean(),
});
export const api = {
  origenes:(token:string,q:string,signal:AbortSignal)=>apiRequest('/api/documentos/origenes?'+new URLSearchParams({q}),z.object({documentos:z.array(z.object({id,codigo_visible:z.string(),asunto:z.string()})),hay_mas:z.boolean()}),{signal},token),
  buscarUbicaciones: (token: string, q: string, signal: AbortSignal) =>
    apiRequest(
      '/api/documentos/ubicaciones?' + new URLSearchParams({ q }),
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
  lista: (t: string, q: string) =>
    apiRequest('/api/documentos' + (q ? '?' + q : ''), listaSchema, {}, t),
  detalle: (t: string, d: string) =>
    apiRequest('/api/documentos/' + encodeURIComponent(d), detalleSchema, {}, t),
  historial: (t: string, d: string) =>
    apiRequest('/api/documentos/' + encodeURIComponent(d) + '/historial', historialSchema, {}, t),
  opciones: (t: string) => apiRequest('/api/documentos/opciones', opcionesSchema, {}, t),
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
      !actual.padre_id && actual.clase !== 'Lugar'
        ? actual.clase + ': ' + actual.nombre
        : actual.nombre,
    );
    actual = actual.padre_id ? unidades.find((u) => u.id === actual!.padre_id) : undefined;
  }
  return partes.join(' / ');
}
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
