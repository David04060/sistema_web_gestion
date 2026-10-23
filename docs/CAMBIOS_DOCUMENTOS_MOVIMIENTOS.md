# Manifiesto de Documentos y Movimientos

Las rutas son relativas a C:/Users/David/Sistema_Web_Final. No se eliminaron archivos funcionales ni se instalaron dependencias.

## Creados (validacion e implementacion)

- `frontend/src/features/documentos/pages/DocumentoFormularioPage.tsx`
- `frontend/src/features/documentos/components/DocumentoAcciones.tsx`
- `frontend/src/features/documentos/components/DocumentoHistorial.tsx`
- `frontend/src/features/documentos/styles/Documentos.module.css`
- `frontend/src/features/movimientos/components/MovimientoAcciones.tsx`
- `frontend/tests/documentos.test.mjs`
- `backend/tests/flujo-migration-sandbox.mjs`
- `backend/tests/flujo-migration.integration.mjs`
- `backend/tests/documental-http-casos.mjs`
- `backend/tests/documental-visual.mjs`
- `docs/DOCUMENTOS_MOVIMIENTOS.md`
- `docs/CAMBIOS_DOCUMENTOS_MOVIMIENTOS.md`
- `docs/MIGRACION_DOCUMENTAL_APLICADA.json`
- `docs/VERIFICACION_FINAL_POSTGRESQL_DOCUMENTAL.json`
- `docs/RESULTADOS_INTEGRACION_DOCUMENTAL.json`
- `docs/evidencias/documento-movil-qa.png`
- `docs/evidencias/recorrido-escritorio-qa.png`

## Ampliados o actualizados

- `backend/src/modules/documentos/documentos.controller.ts`
- `backend/src/modules/documentos/documentos.repository.ts`
- `backend/src/modules/documentos/documentos.routes.ts`
- `backend/src/modules/documentos/documentos.schema.ts`
- `backend/src/modules/documentos/documentos.service.ts`
- `backend/src/modules/movimientos/movimientos.controller.ts`
- `backend/src/modules/movimientos/movimientos.repository.ts`
- `backend/src/modules/movimientos/movimientos.routes.ts`
- `backend/src/modules/movimientos/movimientos.schema.ts`
- `backend/src/modules/movimientos/movimientos.service.ts`
- `frontend/src/features/documentos/api/documentos.api.ts`
- `frontend/src/features/documentos/schemas/documentos.schema.ts`
- `frontend/src/features/documentos/pages/DocumentosListaPage.tsx`
- `frontend/src/features/documentos/pages/DocumentoDetallePage.tsx`
- `frontend/src/features/movimientos/api/movimientos.api.ts`
- `frontend/src/features/movimientos/schemas/movimientos.schema.ts`
- `frontend/src/features/movimientos/pages/MovimientosPages.tsx`
- `frontend/src/routes/AppRoutes.tsx`
- `backend/tests/admin-sandbox.mjs`
- `backend/tests/catalogos.integration.mjs`
- `backend/package.json`
- `.gitignore`
- `README.md`
- `docs/PROPUESTA_FLUJO_CINCO_ESTADOS.md`
- `docs/REVISION_DOCUMENTOS_MOVIMIENTOS.md`
- `docs/VALIDACION_MIGRACION_DOCUMENTAL.md`

## SQL aplicado sin modificar su version aprobada

- `backend/scripts/sql/20261021-flujo-documental-cinco-estados.sql`: COMMIT autorizado, SHA-256 conservado.

Los repositorios agregan SQL parametrizado; servicios agregan reglas y transacciones; controladores y rutas agregan operaciones HTTP. Las paginas/componentes agregan formularios y operaciones reales. Los esquemas validan contratos y estados. Los verificadores crean y limpian QA aislada; las pruebas previas se adaptaron al esquema actual. Los informes y evidencias registran resultados sin cuentas institucionales ni secretos.

El respaldo privado queda en `backend/.private/backups/`, excluido por .gitignore. Los directorios dist se regeneraron por build. No se modificaron package-lock ni dependencias.
