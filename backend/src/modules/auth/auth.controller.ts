/** Archivo: Responde al inicio de sesión y a la consulta del perfil de la cuenta autenticada.
 */
import type { Request, Response, NextFunction } from 'express';
import { loginSchema } from './auth.schema.js';
import { iniciarSesion } from './auth.service.js';
import { usuarioPublico } from './auth.mapper.js';
import type { RequestAutenticada } from '../../middlewares/auth.middleware.js';
/** Valida la entrada HTTP y traduce el resultado del servicio a 200, 400 o 401. */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validacion = loginSchema.safeParse(req.body);
    if (!validacion.success) {
      res.status(400).json({
        error: 'Datos de inicio de sesión inválidos',
      });
      return;
    }
    const resultado = await iniciarSesion(validacion.data);
    if (!resultado) {
      res.status(401).json({
        error: 'Usuario o contraseña incorrectos',
      });
      return;
    }
    res.status(200).json(resultado);
  } catch (error) {
    next(error);
  }
}
/** Devuelve el perfil público comprobado por requiereAuth; sin cuenta responde que debe iniciar sesión. */
export function me(req: RequestAutenticada, res: Response): void {
  if (!req.usuario) {
    res.status(401).json({ error: 'Autenticación requerida' });
    return;
  }
  res.json({
    usuario: usuarioPublico(req.usuario),
  });
}
