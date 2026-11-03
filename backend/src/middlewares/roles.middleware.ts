import type { Response, NextFunction } from 'express';
import type { RequestAutenticada } from './auth.middleware.js';
/** Autoriza por rol después de requiereAuth. No sustituye la autenticación. */
export function requiereRol(...roles: string[]) {
  // Distingue ausencia de sesión (401) de un rol sin autorización (403).
  return (req: RequestAutenticada, res: Response, next: NextFunction): void => {
    if (!req.usuario) {
      res.status(401).json({
        error: 'Autenticación requerida',
      });
      return;
    }
    if (!roles.includes(req.usuario.rol)) {
      res.status(403).json({
        error: 'No tienes permiso para esta operación',
      });
      return;
    }
    next();
  };
}
