import type { Response } from 'express';
import type { RequestAutenticada } from '../../middlewares/auth.middleware.js';
import { validar } from '../../shared/http/validar.js';
import { parametroIdSchema } from '../../shared/admin/admin.schema.js';
import { externoSchema, presentacionSchema, recibirIngresoSchema } from './ingresos.schema.js';
import * as service from './ingresos.service.js';

export async function consultar(req: RequestAutenticada, res: Response) {
    const {pagina,limite}=validar(paginaSchema,req.query);
    res.json(await service.consultar(req.usuario!.id, validar(parametroIdSchema, req.params).id,pagina,limite));
}
export async function recepcion(req: RequestAutenticada, res: Response) {
    res.json(await service.recepcion(req.usuario!.id, validar(parametroIdSchema, req.params).id));
}
export async function recibir(req: RequestAutenticada, res: Response) {
    res.status(201).json(await service.incorporar(req.usuario!.id, validar(parametroIdSchema, req.params).id, validar(recibirIngresoSchema, req.body), true));
}
export async function formalizar(req: RequestAutenticada, res: Response) {
    res.status(201).json(await service.incorporar(req.usuario!.id, validar(parametroIdSchema, req.params).id, validar(presentacionSchema, req.body), false));
}
export async function externo(req: RequestAutenticada, res: Response) {
    res.status(201).json(await service.externo(req.usuario!.id, validar(externoSchema, req.body)));
}

import * as ciclo from './ciclo.service.js';
import { paginaSchema, contextoSchema, actuacionSchema, evidenciaSchema, concluirSchema, invalidarSchema, reingresoSchema } from './ingresos.schema.js';
export async function historia(req: RequestAutenticada, res: Response) {
    const {pagina,limite}=validar(paginaSchema,req.query);
    res.json(await ciclo.historia(req.usuario!.id,validar(parametroIdSchema,req.params).id,pagina,limite));
}
export async function actuaciones(req: RequestAutenticada, res: Response) {
    const {id,ingreso}=validar(contextoSchema,req.params), {pagina,limite}=validar(paginaSchema,req.query);
    res.json(await ciclo.actuaciones(req.usuario!.id,id,ingreso,pagina,limite));
}
export async function continuar(req: RequestAutenticada, res: Response) {
    const {id,ingreso}=validar(contextoSchema,req.params), datos=validar(actuacionSchema,req.body);
    res.status(201).json(await ciclo.actuar(req.usuario!.id,id,ingreso,datos.descripcion,false));
}
export async function evidencia(req: RequestAutenticada, res: Response) {
    const {id,ingreso}=validar(contextoSchema,req.params), datos=validar(evidenciaSchema,req.body);
    res.status(201).json(await ciclo.actuar(req.usuario!.id,id,ingreso,datos.descripcion,true));
}
export async function concluir(req: RequestAutenticada, res: Response) {
    const {id,ingreso}=validar(contextoSchema,req.params), datos=validar(concluirSchema,req.body);
    res.json(await ciclo.cerrar(req.usuario!.id,id,ingreso,datos.motivo,datos.evidencia_id));
}
export async function invalidar(req: RequestAutenticada, res: Response) {
    const {id,ingreso}=validar(contextoSchema,req.params), datos=validar(invalidarSchema,req.body);
    res.json(await ciclo.cerrar(req.usuario!.id,id,ingreso,datos.motivo,null));
}
export async function reingresar(req: RequestAutenticada, res: Response) {
    const {id}=validar(parametroIdSchema,req.params), datos=validar(reingresoSchema,req.body);
    res.status(201).json(await ciclo.reingresar(req.usuario!.id,id,datos.ingreso_anterior_id,datos));
}

export async function auditoria(req: RequestAutenticada,res: Response) {
    const {pagina,limite}=validar(paginaSchema,req.query);
    res.json(await ciclo.auditoria(req.usuario!.id,validar(parametroIdSchema,req.params).id,pagina,limite));
}
