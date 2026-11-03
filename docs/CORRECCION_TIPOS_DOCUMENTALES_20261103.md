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
