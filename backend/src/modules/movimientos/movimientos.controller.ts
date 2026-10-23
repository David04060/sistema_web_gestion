import type { Response } from 'express';
import type { RequestAutenticada } from '../../middlewares/auth.middleware.js';
import { validar } from '../../shared/http/validar.js';
import { parametroIdSchema } from '../../shared/admin/admin.schema.js';
import { filtrosSchema, derivarSchema, recepcionSchema, motivoMovimientoSchema, recuperacionSchema } from './movimientos.schema.js';
import * as service from './movimientos.service.js';
/**
 * Consulta el listado mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function listar(req: RequestAutenticada, res: Response) {
    res.json(await service.listar(req.usuario!.id, validar(filtrosSchema, req.query)));
}
/**
 * Consulta el detalle mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function detalle(req: RequestAutenticada, res: Response) {
    res.json({ movimiento: await service.detalle(req.usuario!.id, validar(parametroIdSchema, req.params).id) });
}
/**
 * Confirma la salida física mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function derivar(req: RequestAutenticada, res: Response) {
    res.status(201).json({ movimiento: await service.derivar(req.usuario!.id, validar(derivarSchema, req.body)) });
}
/**
 * Confirma la recepción física mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function recibir(req: RequestAutenticada, res: Response) {
    res.json({ movimiento: await service.resolver(req.usuario!.id, validar(parametroIdSchema, req.params).id, 'recibir', validar(recepcionSchema, req.body)) });
}
/**
 * Rechaza la recepción con motivo mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function rechazar(req: RequestAutenticada, res: Response) {
    res.json({ movimiento: await service.resolver(req.usuario!.id, validar(parametroIdSchema, req.params).id, 'rechazar', validar(motivoMovimientoSchema, req.body)) });
}
/**
 * Confirma la recuperación en origen mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function recuperar(req: RequestAutenticada, res: Response) {
    res.json({ movimiento: await service.resolver(req.usuario!.id, validar(parametroIdSchema, req.params).id, 'recuperar', validar(recuperacionSchema, req.body)) });
}
/**
 * Cancela el traslado con recuperación confirmada mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function cancelar(req: RequestAutenticada, res: Response) {
    res.json({ movimiento: await service.resolver(req.usuario!.id, validar(parametroIdSchema, req.params).id, 'cancelar', validar(recuperacionSchema, req.body)) });
}
