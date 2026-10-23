import type { Response } from 'express';
import type { RequestAutenticada } from '../../middlewares/auth.middleware.js';
import { validar } from '../../shared/http/validar.js';
import * as schema from './siseve.schema.js';
import * as service from './siseve.service.js';
/**
 * Consulta metadatos administrativos restringidos mediante el servicio del módulo; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param _req - Solicitud HTTP; este controlador no necesita leer sus campos.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function administracion(_req: RequestAutenticada, res: Response) {
    res.json(await service.administracion());
}
/**
 * Registra la autorización mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function autorizar(req: RequestAutenticada, res: Response) {
    const d = validar(schema.autorizacionSchema, req.body);
    res.json(await service.autorizar(req.usuario!.id, d.usuario_id, d.activo));
}
/**
 * Sustituye la clave adicional mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function cambiarClave(req: RequestAutenticada, res: Response) {
    res.json(await service.cambiarClave(req.usuario!.id, validar(schema.claveNuevaSchema, req.body).contrasena));
}
/**
 * Ejecuta la operación documental seleccionada mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function operar(req: RequestAutenticada, res: Response) {
    res.json({ resultado: await service.operar(req.usuario!.id, validar(schema.operacionSchema, req.body)) });
}
/**
 * Consulta los metadatos de acceso propios mediante el servicio del módulo; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function accesoPropio(req: RequestAutenticada, res: Response) {
    res.json(await service.accesoPropio(req.usuario!.id));
}
