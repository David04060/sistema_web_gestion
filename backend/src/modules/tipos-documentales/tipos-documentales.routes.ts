import { Router } from 'express';
import { requiereAuth } from '../../middlewares/auth.middleware.js';
import { requiereRol } from '../../middlewares/roles.middleware.js';
import * as controller from './tipos-documentales.controller.js';
export const tiposDocumentalesRouter = Router();
tiposDocumentalesRouter.use(requiereAuth);
tiposDocumentalesRouter.use(/** Impide almacenar respuestas privadas en caché y continúa hacia el controlador autorizado. */ (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});
tiposDocumentalesRouter.get('/', controller.listar);
tiposDocumentalesRouter.get('/:id', controller.detalle);
tiposDocumentalesRouter.post('/', requiereRol('Administrador'), controller.crear);
tiposDocumentalesRouter.put('/:id', requiereRol('Administrador'), controller.editar);
