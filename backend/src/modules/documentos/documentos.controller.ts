import { paginaSchema } from '../ingresos/ingresos.schema.js';
import type { Response } from 'express';
import type { RequestAutenticada } from '../../middlewares/auth.middleware.js';
import { validar } from '../../shared/http/validar.js';
import { parametroIdSchema } from '../../shared/admin/admin.schema.js';
import { filtrosSchema, registrarSchema, corregirSchema, anularSchema, autorizarSchema, vincularArchivoSchema } from './documentos.schema.js';
import * as service from './documentos.service.js';
/** Metadatos mínimos de archivos actualmente asignados al actor. */
export async function archivosDisponibles(req: RequestAutenticada, res: Response) {
    res.json(await service.archivosDisponibles(req.usuario!.id));
}
/** La autorización y la vinculación se confirman dentro de una transacción. */
export async function vincularArchivo(req: RequestAutenticada, res: Response) {
    res.json({ documento: await service.vincularArchivo(req.usuario!.id, validar(parametroIdSchema, req.params).id, validar(vincularArchivoSchema, req.body)) });
}
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

export async function recorrido(req:RequestAutenticada,res:Response){const {pagina,limite}=validar(paginaSchema,req.query);res.json(await service.recorrido(req.usuario!.id,validar(parametroIdSchema,req.params).id,pagina,limite));}
