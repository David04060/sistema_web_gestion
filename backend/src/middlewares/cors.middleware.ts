/** Archivo: Permite solicitudes del navegador solo desde los sitios configurados para esta API.
 */
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';

/** Permite únicamente los orígenes configurados; el JWT sigue viajando por Authorization. */
export const corsConfigurado: RequestHandler = (req, res, next) => {
  const origen = req.get('Origin');
  if (!origen || env.CORS_ORIGINS.length === 0) {
    next();
    return;
  }
  res.vary('Origin');
  if (!env.CORS_ORIGINS.includes(origen)) {
    res.status(403).json({ error: 'Origen no permitido' });
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', origen);
  res.setHeader(
    'Access-Control-Expose-Headers',
    'RateLimit, RateLimit-Policy, Retry-After, X-Export-Total, X-Export-Generated-At, Content-Disposition',
  );
  if (req.method === 'OPTIONS') {
    const metodo = req.get('Access-Control-Request-Method');
    const metodos = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
    const cabeceras = (req.get('Access-Control-Request-Headers') ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    res.vary('Access-Control-Request-Headers');
    if (
      !metodo ||
      !metodos.includes(metodo) ||
      cabeceras.some((h) => !['authorization', 'content-type', 'accept'].includes(h))
    ) {
      res.status(403).json({ error: 'Solicitud CORS no permitida' });
      return;
    }
    res.setHeader('Access-Control-Allow-Methods', metodos.join(', '));
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.status(204).end();
    return;
  }
  next();
};
