import { Router } from 'express';
import { requiereAuth } from '../../middlewares/auth.middleware.js';
import { obtener } from './dashboard.controller.js';
export const dashboardRouter = Router();
dashboardRouter.use(requiereAuth);
dashboardRouter.get('/', obtener);
