import type { Response } from 'express';
import type { RequestAutenticada } from '../../middlewares/auth.middleware.js';
import { validar } from '../../shared/http/validar.js';
import { idSchema } from '../../shared/admin/admin.schema.js';
import { pdf, limpiarPdf } from './pdf.service.js';
import { iniciarSchema, confirmarSchema, eliminarSchema, abrirSchema } from './pdf.schema.js';
/** Adapta y valida la petición HTTP; el servicio conserva las autorizaciones. */
export async function consultar(req: RequestAutenticada,res: Response) { res.json(await pdf.consultar(req.usuario!.id,validar(idSchema,req.params.id))); }
/** Adapta y valida la petición HTTP; el servicio conserva las autorizaciones. */
export async function iniciar(req: RequestAutenticada,res: Response) { res.json(await pdf.iniciar(req.usuario!.id,validar(idSchema,req.params.id),validar(iniciarSchema,req.body))); }
/** Adapta y valida la petición HTTP; el servicio conserva las autorizaciones. */
export async function confirmar(req: RequestAutenticada,res: Response) {
    const id = validar(idSchema,req.params.id);
    await pdf.confirmar(req.usuario!.id,id,validar(confirmarSchema,req.body).carga);
    // Nunca convertir un commit confirmado en error por la limpieza posterior.
    await limpiarPdf(1,id).catch(() => {});
    res.json(await pdf.consultar(req.usuario!.id,id));
}
/** Adapta y valida la petición HTTP; el servicio conserva las autorizaciones. */
export async function eliminar(req: RequestAutenticada,res: Response) {
    const id = validar(idSchema,req.params.id);
    await pdf.eliminar(req.usuario!.id,id,validar(eliminarSchema,req.body).revision);
    await limpiarPdf(1,id).catch(() => {});
    res.json(await pdf.consultar(req.usuario!.id,id));
}
/** Adapta y valida la petición HTTP; el servicio conserva las autorizaciones. */
export async function abrir(req: RequestAutenticada,res: Response) { res.json(await pdf.abrir(req.usuario!.id,validar(idSchema,req.params.id),validar(abrirSchema,req.body).descargar)); }
