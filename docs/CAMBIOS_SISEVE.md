# Manifiesto de SíseVe

Rutas relativas a `C:/Users/David/Sistema_Web_Final`. No se instalaron dependencias, no se cambiaron los estados ni se ejecutó DDL.

## Backend creado

- `src/modules/siseve/siseve.routes.ts`: JWT, rol administrativo, no-store y límites por cuenta.
- `src/modules/siseve/siseve.controller.ts`: adaptación HTTP y validación de entradas.
- `src/modules/siseve/siseve.service.ts`: administración, scrypt por operación y delegación en servicios existentes.
- `src/modules/siseve/siseve.repository.ts`: tablas de autorización y clave existentes, con SQL parametrizado.
- `src/modules/siseve/siseve.schema.ts`: contratos estrictos y límites de entradas.
- `src/shared/documental/contexto.ts`: conexión y ámbito restringido efímeros por operación.
- `scripts/sql/20261021-siseve-prefijo.sql`: únicamente DML para el prefijo explícitamente aprobado.
- `tests/siseve.test.mjs`: contratos e independencia de contextos concurrentes.
- `tests/siseve-http-casos.mjs`: integración real y verificaciones de confidencialidad en QA.

## Backend modificado

- `src/app.ts`: montaje de /api/siseve.
- `src/shared/documental/transaccion.ts`: comparte la transacción verificada en las llamadas reutilizadas.
- `src/modules/documentos/documentos.repository.ts`: ámbito por defecto ordinario o ámbito restringido ya verificado; elimina una constante duplicada sin usos.
- `src/modules/movimientos/movimientos.repository.ts`: mismo contexto y conexión, conservando autorización del recorrido.
- `src/modules/tipos-documentales/tipos-documentales.repository.ts`: protección constante para restringidos, evitando inferir existencia de casos desde prefijo_protegido.
- `tests/documental-http-casos.mjs`: devuelve tokens de QA para reutilizarlos sin exceder el límite de login.
- `tests/flujo-migration.integration.mjs`: incorpora SíseVe y su informe, conservando limpieza y comparación institucional.
- `tests/catalogos.integration.mjs`: espera el prefijo SISEVE aprobado posteriormente por el usuario.
- `package.json`: alias test:siseve para la integración real aislada completa.

## Frontend creado

- `src/features/siseve/api/siseve.api.ts`: transporte, adaptación de formularios y validación de resultados.
- `src/features/siseve/schemas/siseve.schema.ts`: contratos administrativos, permiso propio y formulario.
- `src/features/siseve/hooks/useAccesoSiseve.ts`: metadato de autorización propio para la interfaz; no desbloquea operaciones.
- `src/features/siseve/pages/SisevePage.tsx`: coordinación de consultas y operaciones independientes.
- `src/features/siseve/pages/SiseveAdministracionPage.tsx`: autorizaciones y configuración/rotación de clave.
- `src/features/siseve/components/SiseveOperacionForm.tsx`: campos por operación, confirmaciones y borrado de clave antes del envío.
- `src/features/siseve/components/SiseveResultado.tsx`: resultados documentales y preparación de siguientes operaciones.
- `src/features/siseve/styles/Siseve.module.css`: aviso, textos y formulario responsivo propios del módulo.
- `tests/siseve.test.mjs`: solicitudes con clave en body, resultados y administración.

## Frontend modificado

- `src/routes/AppRoutes.tsx`: rutas de responsables y administración, dentro de las protecciones existentes.
- `src/components/layout/AdminLayout.tsx`: navegación según rol y autorización individual.

## Documentación y evidencias

- `docs/SISEVE.md`, este manifiesto, `docs/INSPECCION_ESQUEMA_SISEVE.json`, `docs/PREFIJO_SISEVE_APLICADO.json`, `docs/VERIFICACION_FINAL_SISEVE.json`, `docs/RESULTADOS_SISEVE.json`.
- `docs/RESULTADOS_INTEGRACION_DOCUMENTAL.json`: resultados actualizados del verificador completo.
- `docs/evidencias/siseve-escritorio-qa.png`, `docs/evidencias/siseve-movil-qa.png` y `docs/evidencias/siseve-admin-sin-acceso-qa.png`: datos exclusivamente de QA.
- `README.md`, `docs/TIPOS_UBICACIONES.md`, `docs/DOCUMENTOS_MOVIMIENTOS.md`: índice y actualización del estado actual frente a referencias históricas.

No se eliminaron archivos funcionales. Los directorios dist se regeneraron por compilación. El respaldo privado queda en backend/.private/backups, excluido por .gitignore. No se modificaron dependencias ni package-lock.
