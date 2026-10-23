import type { Response } from "express";
import type { RequestAutenticada } from "../../middlewares/auth.middleware.js";
import { validar } from "../../shared/http/validar.js";
import { parametroIdSchema } from "../../shared/admin/admin.schema.js";
import { crearUsuarioSchema, datosUsuarioSchema, estadoSchema, filtrosSchema, restablecerSchema } from "./usuarios.schema.js";
import * as service from "./usuarios.service.js";
/** Los controladores solo validan contratos y adaptan HTTP; no contienen consultas SQL. */
export async function listar(req: RequestAutenticada, res: Response) {
    res.json(await service.listar(validar(filtrosSchema, req.query)));
}
/**
 * Consulta el detalle mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function detalle(req: RequestAutenticada, res: Response) {
    res.json({ usuario: await service.detalle(validar(parametroIdSchema, req.params).id) });
}
/**
 * Crea el registro mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function crear(req: RequestAutenticada, res: Response) {
    res.status(201).json({ usuario: await service.crear(req.usuario!.id, validar(crearUsuarioSchema, req.body)) });
}
/**
 * Edita el registro mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function editar(req: RequestAutenticada, res: Response) {
    const { id } = validar(parametroIdSchema, req.params);
    res.json({ usuario: await service.editar(req.usuario!.id, id, validar(datosUsuarioSchema, req.body)) });
}
/**
 * Cambia la actividad de la cuenta mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function cambiarEstado(req: RequestAutenticada, res: Response) {
    const { id } = validar(parametroIdSchema, req.params);
    res.json({ usuario: await service.cambiarEstado(req.usuario!.id, id, validar(estadoSchema, req.body).activo) });
}
/**
 * Restablece la contraseña mediante el servicio del módulo, validando con Zod las entradas que utiliza; adapta el resultado a la respuesta HTTP sin consultar SQL.
 * @param req - Solicitud HTTP con la identidad incorporada por requiereAuth.
 * @param res - Respuesta Express donde se escribe el contrato público.
 */
export async function restablecer(req: RequestAutenticada, res: Response) {
    const { id } = validar(parametroIdSchema, req.params);
    await service.restablecer(req.usuario!.id, id, validar(restablecerSchema, req.body).contrasena);
    res.json({ mensaje: "Contraseña restablecida. Las sesiones anteriores han sido invalidadas." });
}
