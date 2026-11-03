import type { Request, Response, NextFunction } from 'express';
import { autenticarToken } from '../modules/auth/auth.service.js';
import type { UsuarioAuth } from '../modules/auth/auth.types.js';
export interface RequestAutenticada extends Request {
  usuario?: UsuarioAuth;
}
/** Exige Bearer y delega la verificación criptográfica y del usuario al servicio de autenticación. */
export async function requiereAuth(
  req: RequestAutenticada,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const autorizacion = req.headers.authorization;
  if (!autorizacion || !/^Bearer \S+$/i.test(autorizacion)) {
    res.status(401).json({
      error: 'Autenticación requerida',
    });
    return;
  }
  try {
    const token = autorizacion.slice(7);
    req.usuario = await autenticarToken(token);
    next();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'JsonWebTokenError' ||
        error.name === 'TokenExpiredError' ||
        error.name === 'NotBeforeError' ||
        error.message === 'TOKEN_NO_VALIDO' ||
        error.message === 'Token inválido')
    ) {
      res.status(401).json({
        error: 'Token inválido o expirado',
      });
      return;
    }
    next(error);
  }
}
