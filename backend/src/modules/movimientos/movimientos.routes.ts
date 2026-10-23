import { Router } from 'express';
import { requiereAuth } from '../../middlewares/auth.middleware.js';
import * as controller from './movimientos.controller.js';
export const movimientosRouter = Router();
movimientosRouter.use(requiereAuth);
movimientosRouter.use(/** Impide almacenar respuestas privadas en caché y continúa hacia el controlador autorizado. */ (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});
movimientosRouter.get('/', controller.listar);
movimientosRouter.get('/:id', controller.detalle);
movimientosRouter.post('/', controller.derivar);
movimientosRouter.post('/:id/recibir', controller.recibir);
movimientosRouter.post('/:id/rechazar', controller.rechazar);
movimientosRouter.post('/:id/recuperar', controller.recuperar);
movimientosRouter.post('/:id/cancelar', controller.cancelar);
