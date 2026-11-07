import type { ErrorRequestHandler } from 'express';
import { HttpError } from '../shared/http/HttpError.js';
/** Traduce errores del parser sin exponer cuerpo, cabeceras, SQL ni credenciales en respuestas/logs. */
export const manejarError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  const codigo = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (codigo === '42501') {
    res.status(403).json({ error: 'Operación no autorizada sobre este registro' });
    return;
  }
  if (codigo === 'P0001' || codigo === '40001' || codigo === '40P01') {
    res
      .status(409)
      .json({
        error:
          'La operación no es compatible con el estado o la versión actual; vuelva a consultar',
      });
    return;
  }
  if (codigo === '23505') {
    if (error && typeof error === 'object' && 'constraint' in error && error.constraint === 'usuarios_oficina_activa_unica') {
      res.status(409).json({ error: 'La oficina ya tiene una cuenta activa; utiliza el relevo' });
      return;
    }
    res
      .status(409)
      .json({ error: 'El nombre de usuario, correo o denominación ya está registrado' });
    return;
  }
  if (codigo === '23503' || codigo === '23514') {
    res
      .status(400)
      .json({ error: 'Los datos no cumplen las relaciones o restricciones institucionales' });
    return;
  }
  const tipo =
    error !== null && typeof error === 'object' && 'type' in error ? error.type : undefined;
  switch (tipo) {
    case 'entity.parse.failed':
      res.status(400).json({ error: 'JSON inválido' });
      return;
    case 'entity.too.large':
      res.status(413).json({ error: 'La solicitud supera el tamaño permitido' });
      return;
    case 'charset.unsupported':
    case 'encoding.unsupported':
      res.status(415).json({ error: 'Codificación de solicitud no admitida' });
      return;
    case 'request.aborted':
    case 'request.size.invalid':
      res.status(400).json({ error: 'Solicitud incompleta o inválida' });
      return;
  }
  // Los errores de PostgreSQL pueden incluir detalles de conexión o consultas.
  console.error('Error interno del servidor', {
    tipo: error instanceof Error ? error.name : 'Desconocido',
  });
  res.status(500).json({ error: 'Error interno del servidor' });
};
