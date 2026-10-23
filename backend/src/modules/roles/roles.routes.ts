import { Router } from 'express';
import { requiereAuth } from '../../middlewares/auth.middleware.js';
import { requiereRol } from '../../middlewares/roles.middleware.js';
import { listar, detalle, crear, editar } from './roles.controller.js';
export const rolesRouter = Router();
rolesRouter.use(requiereAuth, requiereRol('Administrador'));
rolesRouter.use(/** Impide almacenar respuestas privadas en caché y continúa hacia el controlador autorizado. */ (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});
rolesRouter.get('/', listar);
rolesRouter.get('/:id', detalle);
rolesRouter.post('/', crear);
rolesRouter.put('/:id', editar);
