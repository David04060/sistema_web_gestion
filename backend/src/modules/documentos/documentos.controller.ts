import {delegacionPersonalSchema} from './delegacion-personal.js';
import type { Response } from 'express';
import type { RequestAutenticada } from '../../middlewares/auth.middleware.js';
import { validar } from '../../shared/http/validar.js';
import { parametroIdSchema } from '../../shared/admin/admin.schema.js';
import { guardarDireccionSchema, asignarSchema, confirmarEntregaSchema, filtrosSchema, registrarSchema, corregirSchema, anularSchema, autorizarSchema } from './documentos.schema.js';
import * as service from './documentos.service.js';
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
    res.json({ documento: await service.detalle(req.usuario!.id, validar(parametroIdSchema, req.params).id) });
}
/**
 * Consulta el historial autorizado mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function historial(req: RequestAutenticada, res: Response) {
    res.json({ historial: await service.historial(req.usuario!.id, validar(parametroIdSchema, req.params).id) });
}
/**
 * Consulta las opciones disponibles mediante el servicio del módulo; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function opciones(req: RequestAutenticada, res: Response) {
    res.json(await service.opciones(req.usuario!.id));
}
/**
 * Registra el documento mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function registrar(req: RequestAutenticada, res: Response) {
    res.status(201).json({ documento: await service.registrar(req.usuario!.id, validar(registrarSchema, req.body)) });
}
/**
 * Corrige el contenido mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function corregir(req: RequestAutenticada, res: Response) {
    res.json({ documento: await service.corregir(req.usuario!.id, validar(parametroIdSchema, req.params).id, validar(corregirSchema, req.body)) });
}
/**
 * Anula lógicamente el documento mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function anular(req: RequestAutenticada, res: Response) {
    res.json({ documento: await service.anular(req.usuario!.id, validar(parametroIdSchema, req.params).id, validar(anularSchema, req.body).motivo) });
}
/**
 * Registra la autorización mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function autorizar(req: RequestAutenticada, res: Response) {
    const datos = validar(autorizarSchema, req.body);
    res.json({ documento: await service.autorizar(req.usuario!.id, validar(parametroIdSchema, req.params).id, datos.usuario_destino_id, datos.motivo) });
}
/**
 * Retira la autorización de Dirección mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function retirarAutorizacion(req: RequestAutenticada, res: Response) {
    res.json({ documento: await service.autorizar(req.usuario!.id, validar(parametroIdSchema, req.params).id, null, validar(anularSchema, req.body).motivo) });
}
/**
 * Solicita una nueva decisión de Dirección mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function solicitarDecision(req: RequestAutenticada, res: Response) {
    res.json({ documento: await service.solicitarDecision(req.usuario!.id, validar(parametroIdSchema, req.params).id, validar(anularSchema, req.body).motivo) });
}

export async function asignarDestinatario(req: RequestAutenticada,res: Response) {
 res.json({documento:await service.gestionarEntrega(req.usuario!.id,validar(parametroIdSchema,req.params).id,validar(asignarSchema,req.body))});
}
export async function confirmarEntrega(req: RequestAutenticada,res: Response) {
 res.json({documento:await service.gestionarEntrega(req.usuario!.id,validar(parametroIdSchema,req.params).id,validar(confirmarEntregaSchema,req.body))});
}

export async function guardarDireccion(req: RequestAutenticada,res: Response) {
 res.json({documento:await service.guardarDireccion(req.usuario!.id,validar(parametroIdSchema,req.params).id,validar(guardarDireccionSchema,req.body))});
}

export async function delegarPersonal(req:RequestAutenticada,res:Response){res.json({documento:await service.delegarPersonal(req.usuario!.id,validar(parametroIdSchema,req.params).id,validar(delegacionPersonalSchema,req.body))});}
