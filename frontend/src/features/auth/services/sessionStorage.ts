/** Archivo: Guarda solo el comprobante de sesión en la pestaña y lee su vencimiento para programar el cierre.
 */
import { z } from 'zod';
export const TOKEN_KEY = 'documental.jwt';
const vencimientoSchema = z.object({
  exp: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER / 1000),
});
/**
 * Lee únicamente exp para programar el cierre local. Decodificar NO verifica firma
 * ni autentica: toda recuperación debe pasar por /me antes de mostrar contenido privado.
 */
export function obtenerVencimiento(token: string): number {
  const partes = token.split('.');
  if (partes.length !== 3 || !partes[1]) throw new Error('Token inválido.');
  const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(base64), (caracter) => caracter.charCodeAt(0));
  const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
  return vencimientoSchema.parse(payload).exp * 1000;
}
/** Adaptador de sesión por pestaña. Los fallos de almacenamiento se propagan para no fingir persistencia. */
export const almacenamientoSesion = {
  /**
   * Obtiene únicamente el JWT de la pestaña; propaga errores del almacenamiento al gestor de sesión.
   */
  leer: () => sessionStorage.getItem(TOKEN_KEY),
  /**
   * Persiste únicamente el JWT ya verificado en esta pestaña; propaga el error si el navegador bloquea la
   * escritura.
   * @param token - JWT de la sesión vigente; no se envía en la URL.
   */
  guardar: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  /**
   * Retira el JWT de esta pestaña; propaga el fallo para que el gestor informe que no pudo limpiar la
   * persistencia.
   */
  eliminar: () => sessionStorage.removeItem(TOKEN_KEY),
};
