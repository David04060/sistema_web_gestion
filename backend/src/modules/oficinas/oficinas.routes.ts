import { Router } from 'express';
import { requiereAuth } from '../../middlewares/auth.middleware.js';
import { requiereRol } from '../../middlewares/roles.middleware.js';
import { listar, detalle, crear, editar } from './oficinas.controller.js';
export const oficinasRouter = Router();
oficinasRouter.use(requiereAuth, requiereRol('Administrador'));
oficinasRouter.use(/** Impide almacenar respuestas privadas en caché y continúa hacia el controlador autorizado. */ (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});
oficinasRouter.get('/', listar);
oficinasRouter.get('/:id', detalle);
oficinasRouter.post('/', crear);
oficinasRouter.put('/:id', editar);
