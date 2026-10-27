import { Router } from 'express';
import { requiereAuth } from '../../middlewares/auth.middleware.js';
import * as controller from './documentos.controller.js';
export const documentosRouter = Router();
documentosRouter.use(requiereAuth);
documentosRouter.use(/** Impide almacenar respuestas privadas en caché y continúa hacia el controlador autorizado. */ (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});
documentosRouter.get('/', controller.listar);
documentosRouter.get('/opciones', controller.opciones);
documentosRouter.get('/archivos-disponibles', controller.archivosDisponibles);
documentosRouter.post('/:id/archivo', controller.vincularArchivo);
documentosRouter.post('/', controller.registrar);
documentosRouter.put('/:id', controller.corregir);
documentosRouter.post('/:id/anular', controller.anular);
documentosRouter.post('/:id/autorizar', controller.autorizar);
documentosRouter.post('/:id/retirar-autorizacion', controller.retirarAutorizacion);
documentosRouter.post('/:id/solicitar-decision', controller.solicitarDecision);
documentosRouter.get('/:id', controller.detalle);
documentosRouter.get('/:id/historial', controller.historial);

documentosRouter.get('/:id/recorrido', controller.recorrido);
