import type { Response } from 'express';
import type { RequestAutenticada } from '../../middlewares/auth.middleware.js';
import { validar } from '../../shared/http/validar.js';
import { parametroIdSchema } from '../../shared/admin/admin.schema.js';
import { guardarTipoSchema } from './tipos-documentales.schema.js';
import * as service from './tipos-documentales.service.js';
/**
 * Consulta el listado mediante el servicio del módulo; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param _req - Solicitud HTTP; este controlador no necesita leer sus campos.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function listar(_req: RequestAutenticada, res: Response) {
    res.json({ tipos: await service.listar() });
}
/**
 * Consulta el detalle mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function detalle(req: RequestAutenticada, res: Response) {
    res.json({ tipo: await service.detalle(validar(parametroIdSchema, req.params).id) });
}
/**
 * Crea el registro mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function crear(req: RequestAutenticada, res: Response) {
    res.status(201).json({ tipo: await service.guardar(req.usuario!.id, validar(guardarTipoSchema, req.body)) });
}
/**
 * Edita el registro mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function editar(req: RequestAutenticada, res: Response) {
    res.json({ tipo: await service.guardar(req.usuario!.id, validar(guardarTipoSchema, req.body), validar(parametroIdSchema, req.params).id) });
}
