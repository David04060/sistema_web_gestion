import type { Response } from 'express';
import type { RequestAutenticada } from '../../middlewares/auth.middleware.js';
import { validar } from '../../shared/http/validar.js';
import { parametroIdSchema } from '../../shared/admin/admin.schema.js';
import { estanteSchema, archivadorSchema, filtrosSchema } from './ubicaciones.schema.js';
import * as service from './ubicaciones.service.js';
/**
 * Consulta las opciones disponibles mediante el servicio del módulo; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function opciones(req: RequestAutenticada, res: Response) {
    res.json(await service.opciones(req.usuario!.id));
}
/**
 * Consulta los estantes autorizados mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function estantes(req: RequestAutenticada, res: Response) {
    res.json({ estantes: await service.listarEstantes(req.usuario!.id, validar(filtrosSchema, req.query)) });
}
/**
 * Consulta los archivadores autorizados mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function archivadores(req: RequestAutenticada, res: Response) {
    res.json({ archivadores: await service.listarArchivadores(req.usuario!.id, validar(filtrosSchema, req.query)) });
}
/**
 * Consulta el estante autorizado mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function estante(req: RequestAutenticada, res: Response) {
    res.json(await service.detalleEstante(req.usuario!.id, validar(parametroIdSchema, req.params).id));
}
/**
 * Consulta el archivador autorizado mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function archivador(req: RequestAutenticada, res: Response) {
    res.json({ archivador: await service.detalleArchivador(req.usuario!.id, validar(parametroIdSchema, req.params).id) });
}
/**
 * Crea el estante mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function crearEstante(req: RequestAutenticada, res: Response) {
    res.status(201).json({ estante: await service.guardarEstante(req.usuario!.id, validar(estanteSchema, req.body)) });
}
/**
 * Edita el estante mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function editarEstante(req: RequestAutenticada, res: Response) {
    res.json({ estante: await service.guardarEstante(req.usuario!.id, validar(estanteSchema, req.body), validar(parametroIdSchema, req.params).id) });
}
/**
 * Crea el archivador mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function crearArchivador(req: RequestAutenticada, res: Response) {
    res.status(201).json({ archivador: await service.guardarArchivador(req.usuario!.id, validar(archivadorSchema, req.body)) });
}
/**
 * Edita el archivador mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function editarArchivador(req: RequestAutenticada, res: Response) {
    res.json({ archivador: await service.guardarArchivador(req.usuario!.id, validar(archivadorSchema, req.body), validar(parametroIdSchema, req.params).id) });
}
