import { pdfRouter } from './modules/documentos-pdf/pdf.routes.js';
import { dashboardActual } from './modules/dashboard/dashboard.documental.js';
import { administracionRouter } from './modules/usuarios/administracion.routes.js';
import { requiereAuth, type RequestAutenticada } from './middlewares/auth.middleware.js';
import { documentosRouter } from './modules/documentos/documentos.routes.js';
import express from 'express';
import helmet from 'helmet';
import { authRouter } from './modules/auth/auth.routes.js';
import { manejarError } from './middlewares/error.middleware.js';
import { env } from './config/env.js';
import { corsConfigurado } from './middlewares/cors.middleware.js';
/** Composición HTTP del monolito. No abre puertos; server.ts gestiona el ciclo de vida. */
export const app = express();
app.disable('x-powered-by');
// Solo el proxy inmediato puede aportar la IP; nunca se confía en toda la cadena.
app.set('trust proxy', env.TRUST_PROXY_HOPS);
app.use(helmet());
app.use(corsConfigurado);
app.use(express.json({ limit: '100kb' }));
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Backend funcionando correctamente',
  });
});
app.get('/api/dashboard', requiereAuth, async (q: RequestAutenticada, r) => {
  r.setHeader('Cache-Control', 'no-store, private');
  r.json(await dashboardActual(q.usuario!.id));
});
app.use('/api/auth', authRouter);
app.use('/api', administracionRouter);
app.use('/api/documentos', pdfRouter);
app.use('/api/documentos', documentosRouter);
app.use((_req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
  });
});
app.use(manejarError);
