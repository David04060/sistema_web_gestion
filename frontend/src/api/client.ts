/** Archivo: Envía solicitudes autenticadas, comprueba respuestas y presenta mensajes de error seguros.
 */
import { z } from 'zod';
import { solicitar } from './conectividad';
// Vite sustituye esta URL pública al compilar; vacío conserva /api y el proxy local.
const apiBase = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const listeners401 = new Set<(token: string) => void>();
/** Solo informa 401 de peticiones con Bearer; un 403 de autorización no revoca la sesión. */
export function suscribirNoAutorizado(listener: (token: string) => void): () => void {
  listeners401.add(listener);
  return () => {
    listeners401.delete(listener);
  };
}
/** Error HTTP o de transporte. status=0 indica que no se obtuvo una respuesta HTTP completa. */
export class ApiError extends Error {
  public readonly status: number;
  /**
   * Crea un error de transporte con estado HTTP; el valor cero representa un fallo previo a recibir la
   * respuesta.
   * @param status - Estado HTTP o cero si no se recibió una respuesta.
   * @param mensaje - Mensaje público que acompaña la transición.
   */
  constructor(status: number, mensaje: string) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
  }
}
/**
 * Asocia el estado HTTP con un mensaje público seguro cuando no puede utilizarse el cuerpo del servidor.
 * @param status - Estado HTTP o cero si no se recibió una respuesta.
 * @returns Mensaje de reserva; esta función no lanza excepciones ni lee el cuerpo HTTP.
 */
function mensajeHttp(status: number): string {
  switch (status) {
    case 400:
      return 'Los datos enviados no son válidos.';
    case 401:
      return 'Credenciales incorrectas o sesión no válida.';
    case 403:
      return 'No tienes permisos para realizar esta acción.';
    case 404:
      return 'El registro solicitado no existe.';
    case 409:
      return 'Los datos entran en conflicto con un registro existente.';
    case 413:
      return 'La solicitud supera el tamaño permitido.';
    case 429:
      return 'Demasiados intentos. Inténtalo más tarde.';
    default:
      return status >= 500 ? 'Error interno del servidor.' : 'No se pudo completar la solicitud.';
  }
}
/**
 * Transporte JSON compartido, sin estado de autenticación ni conocimiento de componentes.
 * @param schema Esquema del contrato esperado; una respuesta 2xx también puede ser inválida.
 * @param token JWT opcional, enviado exclusivamente mediante Authorization.
 * @returns Datos validados; nunca convierte JSON desconocido mediante una aserción de tipo.
 */
export async function apiRequest<T>(
  ruta: string,
  schema: z.ZodType<T>,
  opciones: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(opciones.headers);
  headers.set('Accept', 'application/json');
  if (opciones.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let respuesta: Response;
  let texto: string;
  try {
    ({ respuesta, texto } = await solicitar(apiBase + ruta, { ...opciones, headers }, ruta));
  } catch {
    throw new ApiError(
      0,
      'No se pudo conectar con el servidor. Puede estar iniciándose o haber un problema de ' +
        'red. Vuelve a intentarlo.',
    );
  }
  // El estado HTTP prevalece incluso cuando un proxy devuelve HTML en lugar de JSON.
  if (!respuesta.ok) {
    if (respuesta.status === 401 && token) listeners401.forEach((listener) => listener(token));
    let mensaje = mensajeHttp(respuesta.status);
    // Solo errores de entrada/negocio conocidos pueden mostrar el mensaje público de Express.
    // Nunca trasladar al usuario cuerpos de proxies o detalles de un error interno 5xx.
    if ([400, 404, 409, 422].includes(respuesta.status)) {
      try {
        const datosError = z.object({ error: z.string().min(1).max(1500) }).safeParse(JSON.parse(texto));
        if (datosError.success) mensaje = datosError.data.error;
      } catch {
        /* Conservar el mensaje por estado si el cuerpo no es JSON. */
      }
    }
    throw new ApiError(respuesta.status, mensaje);
  }
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new ApiError(respuesta.status, 'El servidor devolvió una respuesta inválida.');
  }
  const validacion = schema.safeParse(datos);
  if (!validacion.success) {
    throw new ApiError(respuesta.status, 'La respuesta del servidor no cumple el formato esperado.');
  }
  return validacion.data;
}

/** Descarga binaria explícita: un intento, aborto por contexto y errores públicos; no usa el lector JSON. */
export async function apiArchivo(
  ruta: string,
  token: string,
  signal: AbortSignal,
  alRecibir?: () => void,
): Promise<{ blob: Blob; total: number }> {
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const headers = new Headers({ Accept: mime, Authorization: 'Bearer ' + token });
  let respuesta: Response;
  try {
    respuesta = await fetch(apiBase + ruta, { method: 'GET', headers, cache: 'no-store', signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ApiError(0, 'No se pudo generar el archivo. Comprueba la conexión y vuelve a intentarlo.');
  }
  if (!respuesta.ok) {
    if (respuesta.status === 401) listeners401.forEach((listener) => listener(token));
    let mensaje = mensajeHttp(respuesta.status);
    if ([400, 404, 409, 422, 429].includes(respuesta.status)) {
      try {
        const datos = z.object({ error: z.string().min(1).max(1500) }).safeParse(await respuesta.json());
        if (datos.success) mensaje = datos.data.error;
      } catch {
        /* Mensaje público por estado. */
      }
    }
    throw new ApiError(respuesta.status, mensaje);
  }
  if (
    !respuesta.headers.get('content-type')?.toLowerCase().startsWith(mime) ||
    !/^\d{1,5}$/.test(respuesta.headers.get('X-Export-Total') ?? '')
  )
    throw new ApiError(0, 'El servidor no devolvió un archivo Excel válido. Vuelve a intentarlo.');
  const total = Number(respuesta.headers.get('X-Export-Total'));
  if (total > 10000) throw new ApiError(0, 'El archivo excede el límite de exportación.');
  alRecibir?.();
  let blob: Blob;
  try {
    blob = await respuesta.blob();
    signal.throwIfAborted();
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ApiError(0, 'La descarga se interrumpió. Vuelve a intentarlo.');
  }
  if (blob.size < 4 || blob.size > 32 * 1024 * 1024)
    throw new ApiError(0, 'El archivo Excel está vacío o supera el tamaño permitido.');
  const firma = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (firma[0] !== 80 || firma[1] !== 75 || firma[2] !== 3 || firma[3] !== 4)
    throw new ApiError(0, 'El archivo recibido no tiene un formato Excel válido.');
  return { blob, total };
}
