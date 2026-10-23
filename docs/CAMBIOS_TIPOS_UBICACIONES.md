# Manifiesto de Tipos Documentales y Ubicaciones

## Archivos creados

- `backend/src/modules/tipos-documentales/tipos-documentales.controller.ts`: Adaptación HTTP y validación de entrada.
- `backend/src/modules/tipos-documentales/tipos-documentales.repository.ts`: Acceso SQL parametrizado.
- `backend/src/modules/tipos-documentales/tipos-documentales.routes.ts`: Rutas autenticadas y permisos.
- `backend/src/modules/tipos-documentales/tipos-documentales.schema.ts`: Contrato Zod y tipos.
- `backend/src/modules/tipos-documentales/tipos-documentales.service.ts`: Reglas de negocio y transacciones.
- `backend/src/modules/ubicaciones/ubicaciones.controller.ts`: Adaptación HTTP y validación de entrada.
- `backend/src/modules/ubicaciones/ubicaciones.repository.ts`: Acceso SQL parametrizado.
- `backend/src/modules/ubicaciones/ubicaciones.routes.ts`: Rutas autenticadas y permisos.
- `backend/src/modules/ubicaciones/ubicaciones.schema.ts`: Contrato Zod y tipos.
- `backend/src/modules/ubicaciones/ubicaciones.service.ts`: Reglas de negocio y transacciones.
- `frontend/src/features/tipos-documentales/api/tipos.api.ts`: Transporte HTTP y validación de respuesta.
- `frontend/src/features/tipos-documentales/components/TipoForm.tsx`: Formulario y validaciones de presentación.
- `frontend/src/features/tipos-documentales/pages/TiposPages.tsx`: Páginas y navegación del módulo.
- `frontend/src/features/tipos-documentales/schemas/tipos.schema.ts`: Contrato Zod y tipos.
- `frontend/src/features/ubicaciones/api/ubicaciones.api.ts`: Transporte HTTP y validación de respuesta.
- `frontend/src/features/ubicaciones/components/UbicacionForms.tsx`: Formulario y validaciones de presentación.
- `frontend/src/features/ubicaciones/hooks/useUbicaciones.ts`: Consulta reutilizable de datos autorizados.
- `frontend/src/features/ubicaciones/pages/UbicacionesPages.tsx`: Páginas y navegación del módulo.
- `frontend/src/features/ubicaciones/schemas/ubicaciones.schema.ts`: Contrato Zod y tipos.
- `backend/scripts/sql/20261021-estantes-oficina.sql`: Cambio de esquema expresamente autorizado.
- `backend/tests/catalogos.schema.test.mjs`: Pruebas de regresión o integración con ROLLBACK.
- `backend/tests/catalogos.integration.mjs`: Pruebas de regresión o integración con ROLLBACK.
- `frontend/tests/catalogos.test.mjs`: Pruebas de regresión o integración con ROLLBACK.
- `docs/REVISION_TIPOS_UBICACIONES.md`: Documentación o evidencia de QA.
- `docs/TIPOS_UBICACIONES.md`: Documentación o evidencia de QA.
- `docs/CAMBIOS_TIPOS_UBICACIONES.md`: Documentación o evidencia de QA.
- `docs/evidencias/ubicaciones-escritorio.png`: Documentación o evidencia de QA.
- `docs/evidencias/ubicaciones-movil.png`: Documentación o evidencia de QA.
- `docs/evidencias/tipos-documentales-movil.png`: Documentación o evidencia de QA.
- `docs/evidencias/estante-formulario-movil.png`: Documentación o evidencia de QA.

## Archivos modificados

- `backend/src/app.ts`: Integrar ambos módulos o actualizar su documentación.
- `backend/package.json`: Agregar script optativo test:catalogos; sin dependencias nuevas.
- `backend/tests/admin-sandbox.mjs`: Ampliar las huellas verificadas tras ROLLBACK a los nuevos catálogos, ubicaciones, documentos y correlativos.
- `frontend/src/routes/AppRoutes.tsx`: Integrar ambos módulos o actualizar su documentación.
- `frontend/src/components/layout/AdminLayout.tsx`: Integrar ambos módulos o actualizar su documentación.
- `README.md`: Integrar ambos módulos o actualizar su documentación.
- `frontend/README.md`: Integrar ambos módulos o actualizar su documentación.

## Eliminaciones y archivos generados

No se eliminaron archivos funcionales ni dependencias. dist/ y cachés de compilación se regeneran mediante los comandos habituales. El lanzador temporal de navegador bajo node_modules/.tmp se elimina al finalizar QA. Los estilos nuevos reutilizan CSS Modules compartidos; no hay CSS global específico de estos módulos.
