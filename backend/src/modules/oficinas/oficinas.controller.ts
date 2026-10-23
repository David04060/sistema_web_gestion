import type { Response } from 'express';
import type { RequestAutenticada } from '../../middlewares/auth.middleware.js';
import { validar } from '../../shared/http/validar.js';
import { parametroIdSchema } from '../../shared/admin/admin.schema.js';
import { guardarSchema } from './oficinas.schema.js';
import { service } from './oficinas.service.js';
/** Adaptación HTTP: Express 5 propaga rechazos asíncronos al middleware central. */
export async function listar(_req: RequestAutenticada, res: Response) {
    res.json({ oficinas: await service.listar() });
}
/**
 * Consulta el detalle mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function detalle(req: RequestAutenticada, res: Response) {
    const { id } = validar(parametroIdSchema, req.params);
    res.json(await service.detalle(id));
}
/**
 * Crea el registro mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function crear(req: RequestAutenticada, res: Response) {
    const { nombre } = validar(guardarSchema, req.body);
    res.status(201).json({ registro: await service.guardar(req.usuario!.id, nombre) });
}
/**
 * Edita el registro mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function editar(req: RequestAutenticada, res: Response) {
    const { id } = validar(parametroIdSchema, req.params);
    const { nombre } = validar(guardarSchema, req.body);
    res.json({ registro: await service.guardar(req.usuario!.id, nombre, id) });
}
