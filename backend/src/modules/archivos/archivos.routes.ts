import { env } from '../../config/env.js';
import { HttpError } from '../../shared/http/HttpError.js';
import { Router } from 'express';
import { requiereAuth } from '../../middlewares/auth.middleware.js';
import { requiereRol } from '../../middlewares/roles.middleware.js';
import * as controller from './archivos.controller.js';

export const archivosRouter = Router();
archivosRouter.use((_q,_r,next)=>{if(env.NODE_ENV==='production'&&!env.VINCULACION_ARCHIVOS_HABILITADA)throw new HttpError(409,'La administración archivística no está activada en esta versión');next();});
archivosRouter.use(requiereAuth, requiereRol('Administrador'));
archivosRouter.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store, private'); next(); });
archivosRouter.get('/', controller.listar);
archivosRouter.post('/', controller.crear);
archivosRouter.get('/:id/asignaciones', controller.asignaciones);
archivosRouter.get('/:id', controller.detalle);
archivosRouter.put('/:id', controller.corregir);
