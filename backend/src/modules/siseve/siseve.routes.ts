import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requiereAuth, type RequestAutenticada } from '../../middlewares/auth.middleware.js';
import { requiereRol } from '../../middlewares/roles.middleware.js';
import * as controller from './siseve.controller.js';
export const siseveRouter = Router();
siseveRouter.use(/** Impide almacenar respuestas restringidas y continúa hacia la autenticación de la ruta. */ (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Pragma', 'no-cache');
    next();
});
siseveRouter.use(requiereAuth);
/**
 * Agrupa intentos por la cuenta ya verificada por requiereAuth.
 * El orden de middlewares garantiza la identidad antes de aplicar los límites.
 * @param req - Solicitud autenticada; no se utiliza contraseña ni contenido como clave.
 * @returns ID de la cuenta para no bloquear a toda la red escolar por una misma IP.
 */
function cuentaAutenticada(req: RequestAutenticada): string {
    return req.usuario!.id;
}
const limite = rateLimit({
    passOnStoreError: false,
    windowMs: 15 * 60 * 1000,
    limit: 10,
    keyGenerator: cuentaAutenticada,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Demasiados intentos de operacion restringida. Intentalo mas tarde.' },
});
const limiteAdministrativo = rateLimit({
    passOnStoreError: false,
    windowMs: 15 * 60 * 1000,
    limit: 30,
    keyGenerator: cuentaAutenticada,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
});
siseveRouter.get('/acceso', controller.accesoPropio);
siseveRouter.get('/administracion', requiereRol('Administrador'), controller.administracion);
siseveRouter.put('/autorizaciones', requiereRol('Administrador'), controller.autorizar);
siseveRouter.put('/clave', requiereRol('Administrador'), limiteAdministrativo, controller.cambiarClave);
siseveRouter.post('/operaciones', limite, controller.operar);
