import type { Response } from 'express';
import type { RequestAutenticada } from '../../middlewares/auth.middleware.js';
import * as service from './dashboard.service.js';
/** No acepta identidad, rol ni filtros de alcance desde el cliente. */
export async function obtener(req: RequestAutenticada, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await service.obtener(req.usuario!.id));
}
