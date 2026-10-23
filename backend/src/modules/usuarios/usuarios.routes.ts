import { Router } from "express";
import { requiereAuth } from "../../middlewares/auth.middleware.js";
import { requiereRol } from "../../middlewares/roles.middleware.js";
import * as controller from "./usuarios.controller.js";
export const usuariosRouter = Router();
usuariosRouter.use(requiereAuth, requiereRol("Administrador"));
usuariosRouter.use(/** Impide almacenar respuestas privadas en caché y continúa hacia el controlador autorizado. */ (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
});
usuariosRouter.get("/", controller.listar);
usuariosRouter.get("/:id", controller.detalle);
usuariosRouter.post("/", controller.crear);
usuariosRouter.put("/:id", controller.editar);
usuariosRouter.patch("/:id/estado", controller.cambiarEstado);
usuariosRouter.put("/:id/contrasena", controller.restablecer);
