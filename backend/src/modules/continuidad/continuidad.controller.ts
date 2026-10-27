import type {Response} from 'express';
import type {RequestAutenticada} from '../../middlewares/auth.middleware.js';
import {validar} from '../../shared/http/validar.js';
import {parametroIdSchema} from '../../shared/admin/admin.schema.js';
import * as s from './continuidad.service.js';
import * as v from './continuidad.schema.js';
export async function listar(q:RequestAutenticada,r:Response){r.json(await s.listar(q.usuario!.id,validar(v.paginaSchema,q.query)));}
export async function formalizar(q:RequestAutenticada,r:Response){r.status(201).json(await s.formalizar(q.usuario!.id,validar(v.relevarSchema,q.body)));}
export async function pendientes(q:RequestAutenticada,r:Response){r.json(await s.pendientes(q.usuario!.id,validar(parametroIdSchema,q.params).id,validar(v.paginaSchema,q.query)));}
export async function aceptar(q:RequestAutenticada,r:Response){validar(v.confirmarSchema,q.body);r.json(await s.aceptar(q.usuario!.id,validar(parametroIdSchema,q.params).id));}
export async function original(q:RequestAutenticada,r:Response){r.status(201).json(await s.aceptarOriginal(q.usuario!.id,validar(parametroIdSchema,q.params).id,validar(v.aceptarOriginalSchema,q.body)));}
export async function sustituciones(q:RequestAutenticada,r:Response){r.json(await s.sustituciones(q.usuario!.id,validar(v.paginaSchema,q.query)));}
export async function designar(q:RequestAutenticada,r:Response){r.status(201).json(await s.designar(q.usuario!.id,validar(v.designarSchema,q.body)));}
export async function finalizar(q:RequestAutenticada,r:Response){const d=validar(v.finalizarSchema,q.body);r.json(await s.finalizar(q.usuario!.id,validar(parametroIdSchema,q.params).id,d.motivo));}
export async function ejecutar(q:RequestAutenticada,r:Response){r.json(await s.ejecutar(q.usuario!.id,validar(parametroIdSchema,q.params).id,validar(v.ejecutarSchema,q.body)));}
