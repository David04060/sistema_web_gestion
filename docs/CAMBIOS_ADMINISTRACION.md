# Manifiesto de cambios — administración

Implementación del 21 de octubre de 2026. Ver [informe funcional y de pruebas](ADMINISTRACION.md).

## Archivos creados

| Archivo | Propósito |
| --- | --- |
| [backend/src/modules/oficinas/oficinas.controller.ts](../backend/src/modules/oficinas/oficinas.controller.ts) | Validación de entrada y adaptación de respuestas HTTP. |
| [backend/src/modules/oficinas/oficinas.repository.ts](../backend/src/modules/oficinas/oficinas.repository.ts) | Consultas PostgreSQL parametrizadas. |
| [backend/src/modules/oficinas/oficinas.routes.ts](../backend/src/modules/oficinas/oficinas.routes.ts) | Endpoints y protección JWT/Administrador. |
| [backend/src/modules/oficinas/oficinas.schema.ts](../backend/src/modules/oficinas/oficinas.schema.ts) | Contratos Zod y tipos. |
| [backend/src/modules/oficinas/oficinas.service.ts](../backend/src/modules/oficinas/oficinas.service.ts) | Reglas de negocio del módulo y coordinación transaccional. |
| [backend/src/modules/roles/roles.controller.ts](../backend/src/modules/roles/roles.controller.ts) | Validación de entrada y adaptación de respuestas HTTP. |
| [backend/src/modules/roles/roles.repository.ts](../backend/src/modules/roles/roles.repository.ts) | Consultas PostgreSQL parametrizadas. |
| [backend/src/modules/roles/roles.routes.ts](../backend/src/modules/roles/roles.routes.ts) | Endpoints y protección JWT/Administrador. |
| [backend/src/modules/roles/roles.schema.ts](../backend/src/modules/roles/roles.schema.ts) | Contratos Zod y tipos. |
| [backend/src/modules/roles/roles.service.ts](../backend/src/modules/roles/roles.service.ts) | Reglas de negocio del módulo y coordinación transaccional. |
| [backend/src/modules/usuarios/usuarios.controller.ts](../backend/src/modules/usuarios/usuarios.controller.ts) | Validación de entrada y adaptación de respuestas HTTP. |
| [backend/src/modules/usuarios/usuarios.repository.ts](../backend/src/modules/usuarios/usuarios.repository.ts) | Consultas PostgreSQL parametrizadas. |
| [backend/src/modules/usuarios/usuarios.routes.ts](../backend/src/modules/usuarios/usuarios.routes.ts) | Endpoints y protección JWT/Administrador. |
| [backend/src/modules/usuarios/usuarios.schema.ts](../backend/src/modules/usuarios/usuarios.schema.ts) | Contratos Zod y tipos. |
| [backend/src/modules/usuarios/usuarios.service.ts](../backend/src/modules/usuarios/usuarios.service.ts) | Reglas de negocio del módulo y coordinación transaccional. |
| [backend/src/shared/admin/admin.repository.ts](../backend/src/shared/admin/admin.repository.ts) | Consultas PostgreSQL parametrizadas. |
| [backend/src/shared/admin/admin.schema.ts](../backend/src/shared/admin/admin.schema.ts) | Contratos Zod y tipos. |
| [backend/src/shared/admin/catalogo.repository.ts](../backend/src/shared/admin/catalogo.repository.ts) | Consultas PostgreSQL parametrizadas. |
| [backend/src/shared/admin/catalogo.service.ts](../backend/src/shared/admin/catalogo.service.ts) | Reglas de negocio del módulo y coordinación transaccional. |
| [backend/src/shared/http/HttpError.ts](../backend/src/shared/http/HttpError.ts) | Errores previstos del dominio con estado HTTP público. |
| [backend/src/shared/http/validar.ts](../backend/src/shared/http/validar.ts) | Validación Zod centralizada sin exponer valores privados. |
| [backend/tests/admin-browser.mjs](../backend/tests/admin-browser.mjs) | Servidor de QA transaccional real para verificación en navegador. |
| [backend/tests/admin-sandbox.mjs](../backend/tests/admin-sandbox.mjs) | Transacción exterior y savepoints para SQL real sin commits permanentes. |
| [backend/tests/admin.integration.mjs](../backend/tests/admin.integration.mjs) | Pruebas HTTP/SQL de los tres módulos y sus permisos. |
| [backend/tests/admin.schema.test.mjs](../backend/tests/admin.schema.test.mjs) | Regresiones de contratos y validaciones. |
| [docs/ADMINISTRACION.md](../docs/ADMINISTRACION.md) | Documentación de implementación, pruebas y cambios. |
| [docs/CAMBIOS_ADMINISTRACION.md](../docs/CAMBIOS_ADMINISTRACION.md) | Documentación de implementación, pruebas y cambios. |
| [docs/evidencias/usuario-formulario-movil.png](../docs/evidencias/usuario-formulario-movil.png) | Evidencia visual con datos transaccionales de QA. |
| [docs/evidencias/usuarios-admin-escritorio.png](../docs/evidencias/usuarios-admin-escritorio.png) | Evidencia visual con datos transaccionales de QA. |
| [docs/evidencias/usuarios-admin-movil.png](../docs/evidencias/usuarios-admin-movil.png) | Evidencia visual con datos transaccionales de QA. |
| [frontend/src/components/layout/AdminLayout.module.css](../frontend/src/components/layout/AdminLayout.module.css) | Estilos encapsulados y responsivos. |
| [frontend/src/components/layout/AdminLayout.tsx](../frontend/src/components/layout/AdminLayout.tsx) | Componente o utilidad compartida de administración. |
| [frontend/src/components/ui/Admin.module.css](../frontend/src/components/ui/Admin.module.css) | Estilos encapsulados y responsivos. |
| [frontend/src/components/ui/CatalogoPages.tsx](../frontend/src/components/ui/CatalogoPages.tsx) | Componente o utilidad compartida de administración. |
| [frontend/src/components/ui/Confirmacion.module.css](../frontend/src/components/ui/Confirmacion.module.css) | Estilos encapsulados y responsivos. |
| [frontend/src/components/ui/Confirmacion.tsx](../frontend/src/components/ui/Confirmacion.tsx) | Componente o utilidad compartida de administración. |
| [frontend/src/components/ui/EstadoCarga.tsx](../frontend/src/components/ui/EstadoCarga.tsx) | Componente o utilidad compartida de administración. |
| [frontend/src/features/oficinas/api/oficinas.api.ts](../frontend/src/features/oficinas/api/oficinas.api.ts) | Transporte específico del módulo mediante Fetch compartido. |
| [frontend/src/features/oficinas/pages/OficinasPages.tsx](../frontend/src/features/oficinas/pages/OficinasPages.tsx) | Páginas funcionales del módulo. |
| [frontend/src/features/oficinas/schemas/oficinas.schema.ts](../frontend/src/features/oficinas/schemas/oficinas.schema.ts) | Contratos Zod y tipos. |
| [frontend/src/features/roles/api/roles.api.ts](../frontend/src/features/roles/api/roles.api.ts) | Transporte específico del módulo mediante Fetch compartido. |
| [frontend/src/features/roles/pages/RolesPages.tsx](../frontend/src/features/roles/pages/RolesPages.tsx) | Páginas funcionales del módulo. |
| [frontend/src/features/roles/schemas/roles.schema.ts](../frontend/src/features/roles/schemas/roles.schema.ts) | Contratos Zod y tipos. |
| [frontend/src/features/usuarios/api/usuarios.api.ts](../frontend/src/features/usuarios/api/usuarios.api.ts) | Transporte específico del módulo mediante Fetch compartido. |
| [frontend/src/features/usuarios/components/UsuarioForm.tsx](../frontend/src/features/usuarios/components/UsuarioForm.tsx) | Componente o utilidad compartida de administración. |
| [frontend/src/features/usuarios/hooks/useCatalogosUsuarios.ts](../frontend/src/features/usuarios/hooks/useCatalogosUsuarios.ts) | Componente o utilidad compartida de administración. |
| [frontend/src/features/usuarios/pages/UsuarioDetallePage.tsx](../frontend/src/features/usuarios/pages/UsuarioDetallePage.tsx) | Páginas funcionales del módulo. |
| [frontend/src/features/usuarios/pages/UsuarioFormularioPage.tsx](../frontend/src/features/usuarios/pages/UsuarioFormularioPage.tsx) | Páginas funcionales del módulo. |
| [frontend/src/features/usuarios/pages/UsuariosListaPage.tsx](../frontend/src/features/usuarios/pages/UsuariosListaPage.tsx) | Páginas funcionales del módulo. |
| [frontend/src/features/usuarios/schemas/usuarios.schema.ts](../frontend/src/features/usuarios/schemas/usuarios.schema.ts) | Contratos Zod y tipos. |
| [frontend/src/hooks/useConsulta.ts](../frontend/src/hooks/useConsulta.ts) | Carga, error, reintento y descarte de respuestas obsoletas. |
| [frontend/src/lib/catalogo.schema.ts](../frontend/src/lib/catalogo.schema.ts) | Contratos Zod y tipos. |
| [frontend/src/lib/fechas.ts](../frontend/src/lib/fechas.ts) | Presentación local de timestamps. |
| [frontend/tests/admin.test.mjs](../frontend/tests/admin.test.mjs) | Regresiones de contratos y validaciones. |

## Archivos modificados

| Archivo | Propósito |
| --- | --- |
| [backend/src/app.ts](../backend/src/app.ts) | Montaje de los tres routers administrativos. |
| [backend/src/middlewares/error.middleware.ts](../backend/src/middlewares/error.middleware.ts) | Errores previstos, duplicados y restricciones PostgreSQL sin detalles privados. |
| [backend/package.json](../backend/package.json) | Comando optativo test:admin para las pruebas transaccionales autorizadas. |
| [frontend/src/api/client.ts](../frontend/src/api/client.ts) | Errores públicos 400/404/409/422 y conflictos 409 sin exponer 5xx. |
| [frontend/src/routes/AppRoutes.tsx](../frontend/src/routes/AppRoutes.tsx) | Shell, páginas y guard SoloAdministrador. |
| [frontend/src/features/dashboard/pages/DashboardPage.tsx](../frontend/src/features/dashboard/pages/DashboardPage.tsx) | Reutilización del shell compartido conservando el perfil. |
| [frontend/src/features/dashboard/styles/Dashboard.module.css](../frontend/src/features/dashboard/styles/Dashboard.module.css) | Retiro de estilos del encabezado trasladado al layout. |
| [README.md](../README.md) | Estado actual y comandos de verificación. |
| [frontend/README.md](../frontend/README.md) | Organización y documentación de los módulos. |

No se eliminaron archivos de la aplicación. Se regeneraron dist/ en ambos proyectos; los artefactos compilados no reemplazan sus fuentes. No se cambiaron dependencias ni package-lock.json. No se modificó el esquema de PostgreSQL.
