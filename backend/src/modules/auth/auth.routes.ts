import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { login, me } from './auth.controller.js';
import { requiereAuth } from '../../middlewares/auth.middleware.js';
export const authRouter = Router();
// Mantiene el límite actual por IP; configurar proxies confiables solo al definir el despliegue.
const limiteLogin = rateLimit({
  passOnStoreError: false,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Demasiados intentos. Inténtalo más tarde.',
  },
});
// No almacenar en caché tokens ni perfiles autenticados.
authRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
authRouter.post('/login', limiteLogin, login);
authRouter.get('/me', requiereAuth, me);
