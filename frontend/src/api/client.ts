import { z } from 'zod';
import { solicitar } from './conectividad';
// Vite sustituye esta URL pública al compilar; vacío conserva /api y el proxy local.
const apiBase = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const listeners401 = new Set<(token: string) => void>();
/** Solo informa 401 de peticiones con Bearer; un 403 de autorización no revoca la sesión. */
export function suscribirNoAutorizado(listener: (token: string) => void): () => void {
    listeners401.add(listener);
    return /** Retira únicamente este consumidor de notificaciones 401. */ () => {
        listeners401.delete(listener);
    };
}
/** Error HTTP o de transporte. status=0 indica que no se obtuvo una respuesta HTTP completa. */
export class ApiError extends Error {
    public readonly status: number;
    /**
     * Crea un error de transporte con estado HTTP; el valor cero representa un fallo previo a recibir la respuesta.
     * @param status - Estado HTTP o cero si no se recibió una respuesta.
     * @param mensaje - Mensaje público que acompaña la transición.
     * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
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
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
function mensajeHttp(status: number): string {
    switch (status) {
        case 400: return 'Los datos enviados no son válidos.';
        case 401: return 'Credenciales incorrectas o sesión no válida.';
        case 403: return 'No tienes permisos para realizar esta acción.';
        case 404: return 'El registro solicitado no existe.';
        case 409: return 'Los datos entran en conflicto con un registro existente.';
        case 413: return 'La solicitud supera el tamaño permitido.';
        case 429: return 'Demasiados intentos. Inténtalo más tarde.';
        default: return status >= 500 ? 'Error interno del servidor.' : 'No se pudo completar la solicitud.';
    }
}
/**
 * Transporte JSON compartido, sin estado de autenticación ni conocimiento de componentes.
 * @param schema Esquema del contrato esperado; una respuesta 2xx también puede ser inválida.
 * @param token JWT opcional, enviado exclusivamente mediante Authorization.
 * @returns Datos validados; nunca convierte JSON desconocido mediante una aserción de tipo.
 */
export async function apiRequest<T>(ruta: string, schema: z.ZodType<T>, opciones: RequestInit = {}, token?: string): Promise<T> {
    const headers = new Headers(opciones.headers);
    headers.set('Accept', 'application/json');
    if (opciones.body && !headers.has('Content-Type'))
        headers.set('Content-Type', 'application/json');
    if (token)
        headers.set('Authorization', `Bearer ${token}`);
    let respuesta: Response;
    let texto: string;
    try {
        ({ respuesta, texto } = await solicitar(apiBase + ruta, { ...opciones, headers }, ruta));
    }
    catch {
        throw new ApiError(0, 'No se pudo conectar con el servidor. Puede estar iniciándose o haber un problema de red. Vuelve a intentarlo.');
    }
    // El estado HTTP prevalece incluso cuando un proxy devuelve HTML en lugar de JSON.
    if (!respuesta.ok) {
        if (respuesta.status === 401 && token)
            listeners401.forEach(/** Notifica el JWT rechazado a cada consumidor para que invalide solo la sesión correspondiente. */  listener => listener(token));
        let mensaje = mensajeHttp(respuesta.status);
        // Solo errores de entrada/negocio conocidos pueden mostrar el mensaje público de Express.
        // Nunca trasladar al usuario cuerpos de proxies o detalles de un error interno 5xx.
        if ([400, 404, 409, 422].includes(respuesta.status)) {
            try {
                const datosError = z.object({ error: z.string().min(1).max(1500) }).safeParse(JSON.parse(texto));
                if (datosError.success)
                    mensaje = datosError.data.error;
            }
            catch { /* Conservar el mensaje por estado si el cuerpo no es JSON. */
            }
        }
        throw new ApiError(respuesta.status, mensaje);
    }
    let datos: unknown;
    try {
        datos = JSON.parse(texto);
    }
    catch {
        throw new ApiError(respuesta.status, 'El servidor devolvió una respuesta inválida.');
    }
    const validacion = schema.safeParse(datos);
    if (!validacion.success) {
        throw new ApiError(respuesta.status, 'La respuesta del servidor no cumple el formato esperado.');
    }
    return validacion.data;
}
