# Corrección de tipos documentales y catálogo de pruebas — 2026-11-03

## Causa y alcance

La ruta activa solo implementaba listado y creación de tipos; faltaban edición y eliminación tanto en API como en la pantalla. La publicación selectiva anterior conservó tipos de prueba como configuración. Se corrigen ambos problemas sin migrar SQL ni alterar los documentos.

## Comportamiento

Cada cuenta documental puede editar exclusivamente los tipos creados por ella en su ámbito vigente. La consulta compartida de Dirección/Secretaría no otorga edición sobre tipos ajenos. Los roles administrativos conservan sus permisos actuales: administrar usuarios no permite apropiarse de tipos documentales.

PUT /api/tipos-documentales/:id permite nombre, prefijo, activo y motivo obligatorio. Con documentos registrados se conserva el prefijo. Los nombres/códigos históricos almacenados en documentos no cambian. Un tipo inactivo deja de ofrecerse en registro y puede reactivarse desde edición.

DELETE /api/tipos-documentales/:id exige motivo y solo elimina tipos propios sin documentos ni correlativos. El formulario muestra confirmación explícita; los tipos usados se desactivan. Ambas operaciones usan el bloqueo transaccional vigente y auditoría.

## Archivos

- Backend: administracion.schema.ts (contratos estrictos), configuracion.operaciones.ts (propiedad, edición, eliminación y capacidades), administracion.operaciones.ts (fachada), administracion.routes.ts (PUT/DELETE).
- Frontend: api/documental.ts (capacidades con valores seguros), TiposActualesPage.tsx (edición, confirmación y estados), nuevo TipoDocumentalForm.tsx (formulario con campos accesibles), Admin.module.css (acciones adaptables y formulario).
- Pruebas: administracion-local.test.mjs y documental.test.mjs. La prueba SSR usa el mismo patrón e instancia React que las demás pruebas del proyecto.

## Limpieza de datos productivos

Base sistema_documental_produccion. Retirados tipos 15 y 16, [PRUEBA REVISIÓN INTEGRAL a465ee] tipos / RVINT, y tipo 2, Prueba local de registro único / VRU. Se comprobó nombre/prefijo exactos, ausencia de documentos/correlativos y rama/base antes del cambio. Copia privada de las filas y auditoría de eliminación conservadas. No se alteraron documentos ni usuarios.

Se conservaron FUT, las oficinas existentes y las unidades Estante Dirección / Informes de noviembre: no hay evidencia para tratarlas como pruebas. No se modificaron la base local ni las bases anteriores ni R2.

## Verificación previa a publicación

Prueba nueva backend observada fallar por ausencia de capacidades; suite revision en PostgreSQL efímero pasó 37/37 tras la corrección. Las cuentas sintéticas solo existieron en ese cluster aislado, retirado al terminar. Frontend 70/70; typecheck, lint y build de ambos proyectos satisfactorios. Compilación frontend dirigida al API Render. Los detalles remotos se añaden después de confirmar el despliegue efectivo.

## Verificación remota y entrega

- Código cb25e328b72bad4ac74a613e08d3a9876ec38a62 desplegado en Render, estado Live. Frontend publicado en Pages; 54/54 recursos coinciden byte por byte con la compilación y la ruta SPA responde 200.
- GET tipos: 403 para roles administrativos y 200 para Dirección, Secretaría y Usuario, según el alcance documental vigente. Metadatos editable/en_uso comprobados contra los creadores reales.
- PUT real de FUT con sus mismos valores y motivo explícito: 200 para su creadora, 403 para Dirección. Los valores finales del catálogo permanecen idénticos; queda auditoría de esta verificación. No se crearon tipos ni documentos para el recorrido productivo.
- Cero tipos de prueba restantes. Pantalla de tipos comprobada con la sesión existente de Dirección en temas claro y oscuro, sin errores de consola; FUT aparece de consulta por pertenecer a Secretaría.
- El control de viewport de Chrome no aplicó el ancho solicitado: la medida efectiva siguió siendo 1296 px. No se declara comprobado el tamaño móvil. El formulario de edición de la creadora se verificó mediante SSR y HTTP, no mediante un nuevo inicio de sesión de Secretaría.
- Se conserva un cambio local de formato ajeno a esta corrección en backend/src/config/local.ts, excluido de estos commits. No se revierte ni se publica ese cambio.

Evidencia privada: tipos-prueba-retirados.json, tipos-verificacion-remota.json, tipos-rojo.log, tipos-verde.log, tipos-front-verde.log, tipos-front-build.log, tipos-render-live.png y tipos-publicado.png. No se versionan secretos ni copias de datos.
