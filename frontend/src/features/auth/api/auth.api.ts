import { apiRequest } from '../../../api/client';
import {
  loginRespuestaSchema,
  perfilRespuestaSchema,
  type LoginInput,
} from '../schemas/auth.schema';
/** Envía las credenciales y valida la respuesta antes de permitir su uso en React. */
export function iniciarSesion(datos: LoginInput) {
  return apiRequest('/api/auth/login', loginRespuestaSchema, {
    method: 'POST',
    body: JSON.stringify(datos),
  });
}
/** Consulta el perfil con Bearer; el servidor vuelve a comprobar actividad y versión del usuario. */
export function obtenerMiUsuario(token: string) {
  return apiRequest('/api/auth/me', perfilRespuestaSchema, {}, token);
}
