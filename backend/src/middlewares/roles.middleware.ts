import type { Response, NextFunction, } from "express";
import type { RequestAutenticada, } from "./auth.middleware.js";
/** Autoriza por rol después de requiereAuth. No sustituye la autenticación. */
export function requiereRol(...roles: string[]) {
    return /** Exige identidad autenticada y pertenencia al conjunto de roles permitido; distingue 401 de 403. */ (req: RequestAutenticada, res: Response, next: NextFunction): void => {
        if (!req.usuario) {
            res.status(401).json({
                error: "Autenticación requerida",
            });
            return;
        }
        if (!roles.includes(req.usuario.rol)) {
            res.status(403).json({
                error: "No tienes permiso para esta operación",
            });
            return;
        }
        next();
    };
}
