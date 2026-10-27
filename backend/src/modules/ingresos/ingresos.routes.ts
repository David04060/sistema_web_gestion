import { Router } from 'express';
import { requiereAuth } from '../../middlewares/auth.middleware.js';
import * as c from './ingresos.controller.js';

export const ingresosRouter = Router();
ingresosRouter.use(requiereAuth);
ingresosRouter.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
ingresosRouter.get('/documentos/:id', c.consultar);
ingresosRouter.get('/recepciones/:id', c.recepcion);
ingresosRouter.post('/recepciones/:id', c.recibir);
ingresosRouter.post('/recibidos/:id', c.formalizar);
ingresosRouter.post('/externos', c.externo);

ingresosRouter.get('/documentos/:id/historia', c.historia);
ingresosRouter.get('/documentos/:id/ingresos/:ingreso/actuaciones', c.actuaciones);
ingresosRouter.post('/documentos/:id/ingresos/:ingreso/continuaciones', c.continuar);
ingresosRouter.post('/documentos/:id/ingresos/:ingreso/evidencias', c.evidencia);
ingresosRouter.post('/documentos/:id/ingresos/:ingreso/conclusion', c.concluir);
ingresosRouter.post('/documentos/:id/ingresos/:ingreso/invalidacion', c.invalidar);
ingresosRouter.post('/documentos/:id/reingresos', c.reingresar);

ingresosRouter.get('/documentos/:id/auditoria', c.auditoria);
