/** Archivo: Recibe solicitudes documentales, valida sus datos y llama a la operación correspondiente.
 */
import { atencionActual, accionSchema, cargaAccionSchema } from './atencion.documental.js';
import { Router } from 'express';
import type { RequestAutenticada } from '../../middlewares/auth.middleware.js';
import { validar } from '../../shared/http/validar.js';
import * as operaciones from './documentos.operaciones.js';
import { consultaDestinatarios, consultaUbicaciones, consultaOrigenes } from './documental.schema.js';
import { descargarExcel } from './exportacion.controller.js';
/** Rutas del modelo vigente. Reciben actor autenticado por app.ts, validan con Zod y
 * delegan la transacción al servicio. Las rutas literales preceden a /:id.
 * Las mutaciones reciben revisión y motivo; responder 404 también oculta falta de lectura. */
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
  res.status(201).json(await operaciones.registrar(actor(req), validar(operaciones.alta, req.body))),
);
documentosRouter.get('/:id/historial', async (req: RequestAutenticada, res) =>
  res.json(await operaciones.historial(actor(req), validar(operaciones.id, req.params.id))),
);
documentosRouter.get('/:id/auditoria', async (req: RequestAutenticada, res) =>
  res.json(await operaciones.auditoria(actor(req), validar(operaciones.id, req.params.id))),
);
// Atención: lectura acumulativa; cada escritura valida autor y revisión en el servicio y en SQL.
documentosRouter.get('/:id/atencion', async (req: RequestAutenticada, res) =>
  res.json(await atencionActual.consultar(actor(req), validar(operaciones.id, req.params.id))),
);
documentosRouter.post('/:id/acciones/pdf/cargas', async (req: RequestAutenticada, res) =>
  res.json(
    await atencionActual.iniciar(
      actor(req),
      validar(operaciones.id, req.params.id),
      validar(cargaAccionSchema, req.body),
    ),
  ),
);
documentosRouter.post('/:id/acciones', async (req: RequestAutenticada, res) =>
  res
    .status(201)
    .json(
      await atencionActual.guardar(
        actor(req),
        validar(operaciones.id, req.params.id),
        null,
        validar(accionSchema, req.body),
      ),
    ),
);
documentosRouter.put('/:id/acciones/:accion', async (req: RequestAutenticada, res) =>
  res.json(
    await atencionActual.guardar(
      actor(req),
      validar(operaciones.id, req.params.id),
      validar(operaciones.id, req.params.accion),
      validar(accionSchema, req.body),
    ),
  ),
);
documentosRouter.post('/:id/acciones/:accion/pdf/abrir', async (req: RequestAutenticada, res) =>
  res.json(
    await atencionActual.abrir(
      actor(req),
      validar(operaciones.id, req.params.id),
      validar(operaciones.id, req.params.accion),
    ),
  ),
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
