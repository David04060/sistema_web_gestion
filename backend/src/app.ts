import { pdfRouter } from './modules/documentos-pdf/pdf.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { siseveRouter } from './modules/siseve/siseve.routes.js';
import { documentosRouter } from './modules/documentos/documentos.routes.js';
import { movimientosRouter } from './modules/movimientos/movimientos.routes.js';
import { tiposDocumentalesRouter } from "./modules/tipos-documentales/tipos-documentales.routes.js";
import { ubicacionesRouter } from "./modules/ubicaciones/ubicaciones.routes.js";
import express from "express";
import helmet from "helmet";
import { authRouter } from "./modules/auth/auth.routes.js";
import { manejarError } from "./middlewares/error.middleware.js";
import { rolesRouter } from "./modules/roles/roles.routes.js";
import { oficinasRouter } from "./modules/oficinas/oficinas.routes.js";
import { usuariosRouter } from "./modules/usuarios/usuarios.routes.js";
import { env } from './config/env.js';
import { corsConfigurado } from './middlewares/cors.middleware.js';
/** Composición HTTP del monolito. No abre puertos; server.ts gestiona el ciclo de vida. */
export const app = express();
app.disable("x-powered-by");
// Solo el proxy inmediato puede aportar la IP; nunca se confía en toda la cadena.
app.set('trust proxy', env.TRUST_PROXY_HOPS);
app.use(helmet());
app.use(corsConfigurado);
app.use(express.json({ limit: "100kb" }));
app.get("/api/health", /** Responde al chequeo de disponibilidad HTTP sin consultar ni exponer datos institucionales. */ (_req, res) => {
    res.status(200).json({
        status: "ok",
        message: "Backend funcionando correctamente",
    });
});
app.use('/api/dashboard', dashboardRouter);
app.use("/api/tipos-documentales", tiposDocumentalesRouter);
app.use("/api/ubicaciones", ubicacionesRouter);
app.use("/api/documentos", pdfRouter);
app.use("/api/documentos", documentosRouter);
app.use("/api/siseve", siseveRouter);
app.use("/api/movimientos", movimientosRouter);
app.use("/api/auth", authRouter);
app.use("/api/roles", rolesRouter);
app.use("/api/oficinas", oficinasRouter);
app.use("/api/usuarios", usuariosRouter);
app.use(/** Devuelve el contrato público de ruta inexistente después de los routers registrados. */ (_req, res) => {
    res.status(404).json({
        error: "Ruta no encontrada",
    });
});
app.use(manejarError);
