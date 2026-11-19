import { Router } from 'express';
import type { RequestAutenticada } from '../../middlewares/auth.middleware.js';
import { validar } from '../../shared/http/validar.js';
import * as operaciones from './documentos.operaciones.js';
import { consultaDestinatarios, consultaUbicaciones, consultaOrigenes } from './documental.schema.js';
import { descargarExcel } from './exportacion.controller.js';
export const documentosRouter = Router();
const actor = (req: RequestAutenticada) => req.usuario!.id;
documentosRouter.get('/opciones', async (req: RequestAutenticada, res) =>
  res.json(await operaciones.opciones(actor(req))),
);
documentosRouter.get('/destinatarios', async (req: RequestAutenticada, res) =>
  res.json(await operaciones.buscarDestinatarios(actor(req), validar(consultaDestinatarios, req.query))),
);
documentosRouter.get('/ubicaciones', async (req: RequestAutenticada, res) =>
  res.json(await operaciones.buscarUbicaciones(actor(req), validar(consultaUbicaciones, req.query))),
);
documentosRouter.get('/exportar-excel', descargarExcel);
documentosRouter.get('/origenes', async (req: RequestAutenticada, res) =>
  res.json(await operaciones.buscarOrigenes(actor(req), validar(consultaOrigenes, req.query).q)),
);
documentosRouter.get('/', async (req: RequestAutenticada, res) =>
  res.json(await operaciones.listar(actor(req), validar(operaciones.filtros, req.query))),
);
documentosRouter.post('/', async (req: RequestAutenticada, res) =>
  res
    .status(201)
    .json(await operaciones.registrar(actor(req), validar(operaciones.alta, req.body))),
);
documentosRouter.get('/:id/historial', async (req: RequestAutenticada, res) =>
  res.json(await operaciones.historial(actor(req), validar(operaciones.id, req.params.id))),
);
documentosRouter.get('/:id/auditoria', async (req: RequestAutenticada, res) =>
  res.json(await operaciones.auditoria(actor(req), validar(operaciones.id, req.params.id))),
);
documentosRouter.get('/:id', async (req: RequestAutenticada, res) =>
  res.json(await operaciones.detalle(actor(req), validar(operaciones.id, req.params.id))),
);
documentosRouter.put('/:id', async (req: RequestAutenticada, res) =>
  res.json(
    await operaciones.corregir(
      actor(req),
      validar(operaciones.id, req.params.id),
      validar(operaciones.correccion, req.body),
    ),
  ),
);
documentosRouter.post('/:id/delegar', async (req: RequestAutenticada, res) =>
  res.json(
    await operaciones.delegar(
      actor(req),
      validar(operaciones.id, req.params.id),
      validar(operaciones.delegacion, req.body),
    ),
  ),
);
documentosRouter.post('/:id/ubicacion', async (req: RequestAutenticada, res) =>
  res.json(
    await operaciones.ubicar(
      actor(req),
      validar(operaciones.id, req.params.id),
      validar(operaciones.ubicacion, req.body),
    ),
  ),
);
documentosRouter.post('/:id/anular', async (req: RequestAutenticada, res) =>
  res.json(
    await operaciones.anular(
      actor(req),
      validar(operaciones.id, req.params.id),
      validar(operaciones.anulacion, req.body),
    ),
  ),
);
