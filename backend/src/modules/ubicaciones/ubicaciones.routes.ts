import { Router } from 'express';
import { requiereAuth } from '../../middlewares/auth.middleware.js';
import * as c from './ubicaciones.controller.js';
export const ubicacionesRouter = Router();
ubicacionesRouter.use(requiereAuth);
ubicacionesRouter.use(/** Impide almacenar respuestas privadas en caché y continúa hacia el controlador autorizado. */ (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});
ubicacionesRouter.get('/opciones', c.opciones);
ubicacionesRouter.get('/estantes', c.estantes);
ubicacionesRouter.get('/estantes/:id', c.estante);
ubicacionesRouter.post('/estantes', c.crearEstante);
ubicacionesRouter.put('/estantes/:id', c.editarEstante);
ubicacionesRouter.get('/archivadores', c.archivadores);
ubicacionesRouter.get('/archivadores/:id', c.archivador);
ubicacionesRouter.post('/archivadores', c.crearArchivador);
ubicacionesRouter.put('/archivadores/:id', c.editarArchivador);
