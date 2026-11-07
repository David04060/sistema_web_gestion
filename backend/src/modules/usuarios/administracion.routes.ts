import { Router } from 'express';
import { z } from 'zod';
import { requiereAuth, type RequestAutenticada } from '../../middlewares/auth.middleware.js';
import { validar } from '../../shared/http/validar.js';
import { idSchema as id } from '../../shared/admin/admin.schema.js';
import * as operaciones from './administracion.operaciones.js';
import {opcionesRelevo,relevarOficina,relevoSchema} from './relevo.operaciones.js';
export const administracionRouter = Router();
administracionRouter.use((req, _r, next) => {
  if (
    !/^\/(usuarios|roles|oficinas|tipos-documentales|ubicaciones|campos-opcionales)(\/|$)/.test(
      req.path,
    )
  )
    return next('router');
  next();
});
administracionRouter.use(requiereAuth, (_q, res, next) => {
  res.setHeader('Cache-Control', 'no-store, private');
  next();
});
const actor = (req: RequestAutenticada) => req.usuario!.id;
administracionRouter.get('/oficinas/:id/relevo',async(req:RequestAutenticada,res)=>res.json(await opcionesRelevo(actor(req),validar(id,req.params.id))));
administracionRouter.post('/oficinas/:id/relevo',async(req:RequestAutenticada,res)=>res.json(await relevarOficina(actor(req),validar(id,req.params.id),validar(relevoSchema,req.body))));
administracionRouter.get('/usuarios', async (req: RequestAutenticada, res) =>
  res.json(await operaciones.usuarios(actor(req), validar(operaciones.filtrosUsuarios, req.query))),
);
administracionRouter.get('/usuarios/:id', async (req: RequestAutenticada, res) =>
  res.json(await operaciones.detalleUsuario(actor(req), validar(id, req.params.id))),
);
administracionRouter.post('/usuarios', async (req: RequestAutenticada, res) =>
  res
    .status(201)
    .json(await operaciones.crearUsuario(actor(req), validar(operaciones.usuarioAlta, req.body))),
);
administracionRouter.put('/usuarios/:id', async (req: RequestAutenticada, res) =>
  res.json(
    await operaciones.editarUsuario(
      actor(req),
      validar(id, req.params.id),
      validar(operaciones.usuarioEdicion, req.body),
    ),
  ),
);
administracionRouter.post('/usuarios/:id/actividad', async (req: RequestAutenticada, res) =>
  res.json(
    await operaciones.cambiarActividad(
      actor(req),
      validar(id, req.params.id),
      validar(operaciones.actividad, req.body),
    ),
  ),
);
administracionRouter.post('/usuarios/:id/clave', async (req: RequestAutenticada, res) => {
  const v = validar(
    z
      .object({
        contrasena: z
          .string()
          .min(8, 'La contraseña debe tener mínimo 8 caracteres')
          .max(128, 'La contraseña debe tener máximo 128 caracteres'),
      })
      .strict(),
    req.body,
  );
  res.json(await operaciones.cambiarClave(actor(req), validar(id, req.params.id), v.contrasena));
});
administracionRouter.get('/roles', async (req: RequestAutenticada, res) =>
  res.json({ roles: (await operaciones.catalogos(actor(req))).roles }),
);
administracionRouter.get('/oficinas', async (req: RequestAutenticada, res) =>
  res.json(await operaciones.oficinas(actor(req))),
);
administracionRouter.get('/oficinas/:id', async (req: RequestAutenticada, res) =>
  res.json(await operaciones.detalleOficina(actor(req), validar(id, req.params.id))),
);
administracionRouter.post('/oficinas', async (req: RequestAutenticada, res) =>
  res
    .status(201)
    .json(await operaciones.crearOficina(actor(req), validar(operaciones.nombre, req.body))),
);
administracionRouter.put('/oficinas/:id', async (req: RequestAutenticada, res) =>
  res.json(
    await operaciones.editarOficina(
      actor(req),
      validar(id, req.params.id),
      validar(operaciones.oficinaEdicion, req.body),
    ),
  ),
);
administracionRouter.post('/oficinas/:id/actividad', async (req: RequestAutenticada, res) =>
  res.json(
    await operaciones.cambiarActividadOficina(
      actor(req),
      validar(id, req.params.id),
      validar(operaciones.oficinaActividad, req.body),
    ),
  ),
);
administracionRouter.get('/tipos-documentales', async (req: RequestAutenticada, res) =>
  res.json(await operaciones.tipos(actor(req))),
);
administracionRouter.post('/tipos-documentales', async (req: RequestAutenticada, res) =>
  res
    .status(201)
    .json(await operaciones.crearTipo(actor(req), validar(operaciones.tipo, req.body))),
);
administracionRouter.put('/tipos-documentales/:id', async (req: RequestAutenticada, res) =>
  res.json(await operaciones.editarTipo(actor(req), validar(id, req.params.id),
    validar(operaciones.tipoEdicion, req.body))),
);
administracionRouter.delete('/tipos-documentales/:id', async (req: RequestAutenticada, res) =>
  res.json(await operaciones.eliminarTipo(actor(req), validar(id, req.params.id),
    validar(operaciones.motivoTipo, req.body))),
);
administracionRouter.get('/ubicaciones', async (req: RequestAutenticada, res) =>
  res.json(
    await operaciones.unidades(
      actor(req),
      req.query.usuario_id === undefined ? undefined : validar(id, req.query.usuario_id),
    ),
  ),
);
administracionRouter.post('/ubicaciones', async (req: RequestAutenticada, res) =>
  res
    .status(201)
    .json(await operaciones.crearUnidad(actor(req), validar(operaciones.unidad, req.body))),
);
administracionRouter.put('/ubicaciones/:id', async (req: RequestAutenticada, res) =>
  res.json(
    await operaciones.editarUnidad(
      actor(req),
      validar(id, req.params.id),
      validar(operaciones.unidad, req.body),
    ),
  ),
);
administracionRouter.get('/campos-opcionales', async (req: RequestAutenticada, res) =>
  res.json(
    await operaciones.campos(
      actor(req),
      req.query.usuario_id === undefined ? undefined : validar(id, req.query.usuario_id),
    ),
  ),
);
administracionRouter.post('/campos-opcionales', async (req: RequestAutenticada, res) =>
  res
    .status(201)
    .json(await operaciones.crearCampo(actor(req), validar(operaciones.campo, req.body))),
);
administracionRouter.put('/campos-opcionales/:id', async (req: RequestAutenticada, res) =>
  res.json(
    await operaciones.renombrarCampo(
      actor(req),
      validar(id, req.params.id),
      validar(operaciones.renombrar, req.body),
    ),
  ),
);
