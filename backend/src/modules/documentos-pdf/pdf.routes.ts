/** Archivo: Publica las solicitudes de metadatos, carga, confirmación, eliminación y lectura de PDF.
 */
import { Router } from 'express';
import type { RequestAutenticada } from '../../middlewares/auth.middleware.js';
import { validar } from '../../shared/http/validar.js';
import { idSchema as id } from '../../shared/admin/admin.schema.js';
import { iniciarSchema, confirmarSchema, eliminarSchema, abrirSchema } from './pdf.schema.js';
import { pdfActual as operaciones } from './pdf.documental.js';
/** Contrato HTTP del PDF vigente: consultar metadatos, preparar, confirmar, eliminar y abrir.
 * app.ts autentica el prefijo; pdf.documental.ts revalida permisos y revisión.
 * La carga usa una URL temporal de R2. Al abrir, el destinatario recibe el PDF
 * codificado en la respuesta después de volver a comprobar su permiso de lectura. */
export const pdfRouter = Router();
pdfRouter.get('/:id/pdf', async (req: RequestAutenticada, res) =>
  res.json(await operaciones.consultar(req.usuario!.id, validar(id, req.params.id))),
);
pdfRouter.post('/:id/pdf/cargas', async (req: RequestAutenticada, res) =>
  res.json(
    await operaciones.iniciar(req.usuario!.id, validar(id, req.params.id), validar(iniciarSchema, req.body)),
  ),
);
pdfRouter.post('/:id/pdf/confirmar', async (req: RequestAutenticada, res) =>
  res.json(
    await operaciones.confirmar(
      req.usuario!.id,
      validar(id, req.params.id),
      validar(confirmarSchema, req.body).carga,
    ),
  ),
);
pdfRouter.post('/:id/pdf/eliminar', async (req: RequestAutenticada, res) =>
  res.json(
    await operaciones.eliminar(
      req.usuario!.id,
      validar(id, req.params.id),
      validar(eliminarSchema, req.body).revision,
    ),
  ),
);
pdfRouter.post('/:id/pdf/abrir', async (req: RequestAutenticada, res) =>
  res.json(
    await operaciones.abrir(
      req.usuario!.id,
      validar(id, req.params.id),
      validar(abrirSchema, req.body).descargar,
    ),
  ),
);
