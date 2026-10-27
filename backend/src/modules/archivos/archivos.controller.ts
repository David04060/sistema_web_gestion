import type { Response } from 'express';
import type { RequestAutenticada } from '../../middlewares/auth.middleware.js';
import { validar } from '../../shared/http/validar.js';
import { parametroIdSchema } from '../../shared/admin/admin.schema.js';
import { crearSchema, filtrosSchema, metadatosSchema, paginacionSchema } from './archivos.schema.js';
import * as service from './archivos.service.js';

/** Valida filtros y conserva la paginación del servidor. */
export async function listar(req: RequestAutenticada, res: Response) {
    res.json(await service.listar(req.usuario!.id, validar(filtrosSchema, req.query)));
}
/** Expone únicamente el detalle administrativo autorizado. */
export async function detalle(req: RequestAutenticada, res: Response) {
    res.json({ archivo: await service.detalle(req.usuario!.id, validar(parametroIdSchema, req.params).id) });
}
/** Crea archivo y primera asignación como una unidad transaccional. */
export async function crear(req: RequestAutenticada, res: Response) {
    res.status(201).json({ archivo: await service.crear(req.usuario!.id, validar(crearSchema, req.body)) });
}
/** No admite responsable, oficina, custodia o períodos en una corrección. */
export async function corregir(req: RequestAutenticada, res: Response) {
    res.json({ archivo: await service.corregir(req.usuario!.id, validar(parametroIdSchema, req.params).id, validar(metadatosSchema, req.body)) });
}
/** Consulta el historial administrativo sin ofrecer operaciones para reescribirlo. */
export async function asignaciones(req: RequestAutenticada, res: Response) {
    res.json(await service.asignaciones(req.usuario!.id, validar(parametroIdSchema, req.params).id, validar(paginacionSchema, req.query)));
}
