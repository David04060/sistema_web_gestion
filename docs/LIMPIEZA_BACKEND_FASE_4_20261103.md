# Limpieza efectiva del backend productivo — fase 4

Fecha: 3 de noviembre de 2026, America/Lima. Proyecto: C:\Users\David\Sistema_Web_Final.

## Resultado y alcance

Se inspeccionó y modificó el backend montado por app.ts/server.ts: autenticación, permisos, cuentas, oficinas, catálogos, documentos, delegación, auditoría, dashboard, PDF/R2 y Excel. Se trabajó sobre los cambios locales existentes. Esta fase modifica **37 fuentes existentes**, crea **6 fuentes de responsabilidad específica** y amplía **una prueba existente con un subtest PDF**. No elimina archivos completos adicionales. Las **25 fuentes eliminadas en fase 2** siguen ausentes y no se atribuyen a esta fase.

La limpieza sí retira código productivo concreto: una rama inalcanzable, una consulta cuyo resultado se descartaba y varias implementaciones duplicadas sustituidas por una fuente común. Los archivos heredados restantes tienen consumidores identificados o herramientas cuya vigencia sigue pendiente; no se borraron por una búsqueda negativa. No hubo commit, push, despliegue, migración, instalación de dependencias ni cambios de configuración privada.

## Antecedentes leídos

Los informes originales de fases 1–3 están fuera del repositorio, bajo C:/Users/David/.codex/visualizations/2026/11/03/01a19ebd-2ff3-7880-adaa-00ba7ce4ca4c/:

- diagnostico-fase1/INFORME_DIAGNOSTICO_FASE_1.md: inventario, grafo activo, límites y conservación.
- diagnostico-fase2/INFORME_DEPURACION_BACKEND_FASE_2.md: 25 bajas definitivas y 32 fuentes conservadas con consumidores privados.
- diagnostico-fase3/INFORME_PRUEBAS_BACKEND_FASE_3.md: runner efímero, identidad segura, fixtures sintéticos y suites 62/35/24.

Se contrastaron esos antecedentes con las fuentes y herramientas actuales. El grafo nuevo revisa **177 archivos**, imports/reexports estáticos, imports dinámicos literales y require. No hay imports sin resolver en los 43 archivos del grafo activo. El único import calculado detectado en ese conjunto ampliado es backend/tests/exportacion-excel.test.mjs:8; la variable ruta apunta literalmente al servicio Excel vigente. Esto no certifica automatizaciones externas desconocidas ni convierte herramientas históricas en operaciones autorizadas.

## Código retirado y evidencia

| Pieza retirada | Evidencia y sustitución | Resultado |
|---|---|---|
| Rama if (!perfilNeon) / else posterior al rechazo de perfilNeon, en config/database.ts | La misma función lanza una excepción antes si perfilNeon es verdadero. El else de éxito remoto es inalcanzable. | Se conserva únicamente la verificación local posterior al rechazo; no se habilitan conexiones remotas. |
| Consulta de oficinas dentro de catalogos() | El único consumidor encontrado es GET /roles en administracion.routes.ts, que toma exclusivamente .roles. No existen otros imports/llamadas de catalogos en las entradas revisadas; el import calculado detectado pertenece a Excel. | catalogos devuelve roles; GET /oficinas conserva oficinas() y sus datos. Se evita una consulta por petición de roles. |
| Dos INSERT idénticos de ubicaciones_documento | registrar() y ubicar() insertaban las mismas columnas y marcadores históricos vacíos, con los mismos tres parámetros. | registrarUbicacion() conserva la consulta y el trigger que captura oficina/ruta. |
| CASE duplicado de nombres de rol en autenticación y administración | Mismos cinco códigos, textos y alias SQL r en las dos proyecciones. | shared/security/roles.ts contiene nombresRolSQL, consumido por autenticación y cuentas/catálogos. |
| Dos mapas idénticos de situaciones en Excel y auditoría | Misma correspondencia para PERSONAL, PENDIENTE_DIRECCION, EN_MESA_DE_PARTES, GUARDADO_DIRECCION, DELEGADO y ANULADO. | shared/documental/presentacion.ts contiene etiquetasSituacion; auditoría conserva por separado RECIBIDO/EMITIDO. |
| Repetición de la condición Dirección + ámbito compartido + pendiente | Aparecía en anular, delegar y ubicar. | permisos() calcula direccionPendiente una vez; 360 combinaciones antes/después dan exactamente las mismas capacidades. |
| Export público innecesario de nombresRol | Sin consumidores externos identificados; la proyección duplicada se centralizó. | El nuevo export nombresRolSQL tiene consumidores explícitos. No se conserva un alias muerto. |

**Archivos completos eliminados por esta fase: ninguno.** No se aplicó una prohibición general de borrar: se retiraron las piezas anteriores donde la evidencia permitía hacerlo. Las bajas completas de fase 2 no se repiten como trabajo nuevo.

## Organización por módulo y funciones

| Módulo | Reorganización concreta | Reglas explicadas por comentarios |
|---|---|---|
| Auth/configuración/HTTP | Formato coherente; CASE público compartido; retirada del else inalcanzable y de comentarios mecánicos dentro de callbacks. | JWT/scrypt, reconsulta de versión/actividad, proxy inmediato, validación local y errores sin secretos. |
| Cuentas | administracion.operaciones.ts queda centrado en validarOficina, miembros, protegerCuenta, usuarios, detalleUsuario, crearUsuario, editarUsuario, cambiarActividad y cambiarClave. | Superadministrador único, oficina inactiva conservada frente a nueva asignación, pertenencias, historia y revocación de sesiones. |
| Catálogos/configuración | catalogos, oficinas, crearOficina, editarOficina, detalleOficina, cambiarActividadOficina, tipos, crearTipo, propietario, unidades, crearUnidad, editarUnidad, campos, crearCampo y renombrarCampo pasan a configuracion.operaciones.ts. Las reexportaciones de la fachada conservan consumidores existentes, incluidos tests. | Oficinas institucionales, titular autorizado, jerarquía sin transferencia, ámbito propio, nombres históricos y auditoría. |
| Schemas administrativos | Los 11 contratos usuarioAlta/usuarioEdicion/nombre/tipo/unidad/campo/renombrar/oficinaEdicion/oficinaActividad/actividad/filtrosUsuarios pasan a administracion.schema.ts. | Cuerpos estrictos y límites actuales; no cambia la validación. Se elimina la dependencia de documentos.operaciones para validar IDs desde administración/PDF. |
| Documentos/delegación | id/alta/correccion/delegacion/ubicacion/anulacion/filtros y auxiliares de validación pasan a documental.schema.ts. registrarValoresIniciales separa captura de etiquetas; registrarUbicacion unifica persistencia repetida. | Clasificación separada de situación; autoría y ámbito; delegación informativa; lectura de relacionados; revisión y anulación lógica. |
| Permisos/auditoría | Núcleo legible, condición Dirección pendiente compartida, nombres cliente/identidad/datos y anteriorPublico/posteriorPublico. | Lectura institucional no concede escritura; auditoría usa una lista pública y excluye claves R2/IDs internos. |
| Dashboard | Formato, consultas divididas y nombres cliente/identidad; funciones contexto, administracion, grupoDocumental, consultarDashboard y dashboardActual mantienen sus responsabilidades. | Ventana de doce meses Lima, grupos disjuntos, Administrador sin contenido documental e instantánea con actor revalidado. |
| PDF/R2 | limpiarObjetosPdf pasa a pdf.limpieza.ts; pdfDocumental conserva su interfaz consultar/iniciar/confirmar/eliminar/abrir/limpiar y el mismo adaptador inyectado. | Bloqueo documento→objetos, revisión esperada, idempotencia, objeto vigente excluido, reintento durable y apertura privada de 60 segundos. |
| Excel | valorCelda separa la conversión; leerInstantaneaExcel separa SQL de ZIP/temporal. escribirExcel y prepararExportacion conservan sus interfaces. | Texto literal sin fórmulas, hora de Perú, Unicode sin cortes, límites sin truncamiento, cancelación y retirada de temporales propios. |

Los comentarios nuevos explican propósito y reglas antes de funciones o bloques. No se añadieron comentarios dentro de expresiones. Se retiraron algunos comentarios antiguos de callbacks que interrumpían la lectura. El anexo manifiesto.json enumera los textos JSDoc nuevos o trasladados por archivo; el conteo no se utiliza como certificación de calidad.

En las 37 fuentes modificadas, las líneas de más de 160 caracteres pasan de **140 a 0**. Las seis fuentes nuevas tampoco tienen líneas de más de 160. Los saltos de SQL se colocaron fuera de literales y se verificaron ejecutando las consultas con PostgreSQL; no se reescribieron tablas, triggers o funciones SQL de la base.

## Defectos funcionales

No se confirmó un defecto funcional nuevo que exigiera cambiar permisos, respuestas HTTP, datos o SQL. Por tanto no se presenta un refactor como reparación funcional ni se preparó una migración innecesaria. La rama inalcanzable y la consulta descartada son defectos de mantenimiento/trabajo redundante corregidos, con los límites indicados arriba.

El problema del search_path del instalador descrito por fase 3 es un antecedente de instalación en base vacía, ajeno al runtime revisado. No se ejecutó ni modificó ese instalador ni se reconstruyó la base de trabajo.

## Pruebas y recorridos

Se usó el runner de fase 3, PostgreSQL 18 temporal en 127.0.0.1 con puerto/rol/marca propios, esquema vacío y fixtures sintéticos. Antes de DDL/escritura verifica identidad; no reutiliza .env de trabajo ni credenciales R2. app.ts se usó para los recorridos HTTP, sin iniciar server.ts ni su recolector automático.

Cierres intermedios: autenticación 23/23; administración 35/35; documentos 35/35 antes y después de reorganizar SQL; dashboard 62/62; PDF 35/35 y después 36/36 con su recorrido adicional; Excel 62/62. La línea base nueva de esta fase fue 62/62.

La única ampliación de pruebas es un subtest en backend/tests/revision-integral-local.test.mjs. Comprueba confirmación idempotente sin duplicar auditoría, reemplazo, revisión obsoleta 409, objeto vigente excluido de la recolección, lectura firmada, fallo simulado de eliminación, pendiente visible y reintento completado. Usa objetos en un Set y rollback PostgreSQL, sin red R2. La validación real de bytes PDF y comandos S3 sigue cubierta por las pruebas existentes del adaptador. No se cambió el runner, fixtures, manifiesto, selección de suites ni package.json.

| Comprobación final | Resultado | Evidencia |
|---|---|---|
| npm test | 62/62; cero fallos, saltos y TODO | final-test.log |
| npm run test:revision:local | 36/36; cero fallos, saltos y TODO | final-test-revision-local.log |
| npm run test:unitarias:heredadas | 24/24; cero fallos, saltos y TODO | final-test-unitarias-heredadas.log |
| Backend typecheck / lint / build | exit 0 en cada comando | resultados-finales.json y logs individuales |
| Frontend typecheck / lint / build | exit 0 en cada comando; fuentes conservadas | frontend-*.log |
| Permisos antes/después | 360 combinaciones iguales | permisos-equivalencia.json |
| Imports del grafo activo | 0 sin resolver | grafo-consumidores.json |
| git diff --check de código revisado | exit 0; sin errores de whitespace | verificación de cierre |

No hubo fallos/saltos/TODO en las suites finales aprobadas. Las 24 complementarias validan funciones/schemas y configuración heredada; no certifican las integraciones históricas completas. Los contratos comprueban las 40 rutas y el orden de exportar-excel antes de /:id. Excel se contrasta con SQL independiente por cinco roles, mes vacío, límites de Lima, campos completos, tipo de celda y límites de filas/tamaño/celda.

El primer intento de pruebas y el primer build frontend dentro del sandbox fallaron al crear subprocesos con EPERM. Se repitieron con ejecución autorizada sin cambiar código/dependencias para eludir errores. El build frontend posterior pasó. No se considera un fallo funcional del backend.

## Conservación comprobada

- SHA-256 de los **476 archivos preexistentes de docs/** idénticos. Este informe y su carpeta QA son adiciones.
- frontend/src y todos los archivos de database/ idénticos a la captura inicial.
- **21 tablas**: iguales huellas agregadas antes/después; **12 secuencias**: mismos valores observados. Columnas, vistas, funciones, triggers, índices, restricciones y dependencias de catálogo coinciden.
- Las consultas de conservación usan transacción REPEATABLE READ READ ONLY y default_transaction_read_only=on. No se alteraron cuentas/documentos/PDF de trabajo.
- Sin conexiones R2 reales, cargas, reemplazos ni eliminaciones de objetos reales. Los clusters temporales de pruebas se detuvieron y retiraron.
- No se borró dist globalmente ni se recreó la base. Las compilaciones regeneraron salidas derivadas normales.

## Fuentes existentes modificadas en esta fase

- backend/src/app.ts
- backend/src/config/database.ts
- backend/src/config/env.ts
- backend/src/config/local.ts
- backend/src/config/neon.ts
- backend/src/middlewares/auth.middleware.ts
- backend/src/middlewares/cors.middleware.ts
- backend/src/middlewares/error.middleware.ts
- backend/src/middlewares/roles.middleware.ts
- backend/src/modules/auth/auth.controller.ts
- backend/src/modules/auth/auth.mapper.ts
- backend/src/modules/auth/auth.repository.ts
- backend/src/modules/auth/auth.routes.ts
- backend/src/modules/auth/auth.schema.ts
- backend/src/modules/auth/auth.service.ts
- backend/src/modules/auth/auth.types.ts
- backend/src/modules/dashboard/dashboard.documental.ts
- backend/src/modules/documentos/auditoria.documental.ts
- backend/src/modules/documentos/documentos.operaciones.ts
- backend/src/modules/documentos/documentos.routes.ts
- backend/src/modules/documentos/exportacion.controller.ts
- backend/src/modules/documentos/exportacion.excel.ts
- backend/src/modules/documentos/exportacion.repository.ts
- backend/src/modules/documentos/fecha-registro.ts
- backend/src/modules/documentos-pdf/pdf.documental.ts
- backend/src/modules/documentos-pdf/pdf.maintenance.ts
- backend/src/modules/documentos-pdf/pdf.routes.ts
- backend/src/modules/documentos-pdf/pdf.schema.ts
- backend/src/modules/documentos-pdf/pdf.storage.ts
- backend/src/modules/usuarios/administracion.operaciones.ts
- backend/src/modules/usuarios/administracion.routes.ts
- backend/src/server.ts
- backend/src/shared/documental/nucleo.ts
- backend/src/shared/http/HttpError.ts
- backend/src/shared/http/validar.ts
- backend/src/shared/security/jwt.ts
- backend/src/shared/security/password.ts

Además: backend/tests/revision-integral-local.test.mjs, únicamente el subtest PDF descrito.

## Fuentes nuevas

- backend/src/modules/documentos/documental.schema.ts
- backend/src/modules/documentos-pdf/pdf.limpieza.ts
- backend/src/modules/usuarios/administracion.schema.ts
- backend/src/modules/usuarios/configuracion.operaciones.ts
- backend/src/shared/documental/presentacion.ts
- backend/src/shared/security/roles.ts

## Elementos conservados con consumidores reales o vigencia pendiente

Se verificaron de nuevo las referencias de .private/performance/medir-backend.mjs (imports de dashboard.service y auth.repository), .private/usuario-delegacion-editar.mjs (lecturas/escrituras explícitas de documentos y movimientos) y .private/render/restaurar-node.mjs (restauración de módulos anteriores). No se ejecutaron esas herramientas. Sus efectos sobre el esquema histórico no se declaran compatibles con el actual. Los consumidores transitorios actuales están en grafo-consumidores.json; los motivos individuales previos se mantienen como antecedente, sin borrar dependencias cuya raíz sigue presente.

| Fuente conservada | Consumidores actuales directos o raíz documentada |
|---|---|
| backend/src/middlewares/roles.middleware.ts | backend/src/modules/siseve/siseve.routes.ts:4; backend/tests/auth.test.mjs:11 |
| backend/src/modules/documentos/auditoria-presentacion.ts | backend/src/modules/documentos/documentos.repository.ts:1 |
| backend/src/modules/documentos/delegacion-personal.ts | backend/src/modules/documentos/documentos.controller.ts:1; backend/src/modules/documentos/documentos.schema.ts:1; backend/src/modules/documentos/documentos.service.ts:1; backend/src/modules/movimientos/movimientos.service.ts:2 |
| backend/src/modules/documentos/documentos.repository.ts | backend/src/modules/dashboard/dashboard.repository.ts:3; backend/src/modules/documentos/documentos.service.ts:8; backend/src/modules/documentos-pdf/pdf.permissions.ts:2; backend/src/modules/documentos-pdf/pdf.service.ts:9; backend/src/modules/movimientos/movimientos.repository.ts:4; backend/src/modules/movimientos/movimientos.service.ts:3 |
| backend/src/modules/documentos/documentos.schema.ts | backend/src/modules/documentos/documentos.controller.ts:6; backend/src/modules/documentos/documentos.repository.ts:5; backend/src/modules/documentos/documentos.service.ts:9; backend/src/modules/movimientos/movimientos.schema.ts:3; backend/src/modules/siseve/siseve.service.ts:13; backend/tests/documentos.schema.test.mjs:3 |
| backend/src/modules/documentos/documentos.service.ts | backend/src/modules/documentos/documentos.controller.ts:7; backend/src/modules/documentos-pdf/pdf.service.ts:8; backend/src/modules/movimientos/movimientos.service.ts:4; backend/src/modules/siseve/siseve.service.ts:12 |
| backend/src/modules/documentos-pdf/pdf.permissions.ts | backend/src/modules/documentos-pdf/pdf.service.ts:7; backend/tests/pdf.permissions.test.mjs:3 |
| backend/src/modules/documentos-pdf/pdf.repository.ts | backend/src/modules/documentos-pdf/pdf.service.ts:13; backend/tests/pdf.postgres.integration.mjs:39 |
| backend/src/modules/documentos-pdf/pdf.service.ts | backend/src/modules/siseve/siseve.service.ts:1; backend/scripts/diagnosticar-pdf-local.mjs:35; backend/scripts/limpiar-pdf.mjs:2; backend/tests/pdf.postgres.integration.mjs:40; backend/tests/pdf.test.mjs:14 |
| backend/src/modules/movimientos/movimientos.repository.ts | backend/src/modules/movimientos/movimientos.service.ts:7 |
| backend/src/modules/movimientos/movimientos.schema.ts | backend/src/modules/movimientos/movimientos.repository.ts:5; backend/src/modules/movimientos/movimientos.service.ts:8; backend/src/modules/siseve/siseve.service.ts:15; backend/tests/documentos.schema.test.mjs:4 |
| backend/src/modules/movimientos/movimientos.service.ts | backend/src/modules/siseve/siseve.service.ts:14 |
| backend/src/modules/oficinas/oficinas.schema.ts | backend/tests/admin.schema.test.mjs:5 |
| backend/src/modules/roles/roles.schema.ts | backend/tests/admin.schema.test.mjs:4 |
| backend/src/modules/siseve/siseve.repository.ts | backend/src/modules/siseve/siseve.service.ts:16 |
| backend/src/modules/siseve/siseve.schema.ts | backend/src/modules/siseve/siseve.controller.ts:4; backend/src/modules/siseve/siseve.service.ts:3; backend/src/modules/siseve/siseve.service.ts:17; backend/tests/pdf.test.mjs:18; backend/tests/siseve.test.mjs:5 |
| backend/src/modules/siseve/siseve.service.ts | backend/src/modules/siseve/siseve.controller.ts:5; backend/tests/pdf.test.mjs:17 |
| backend/src/modules/tipos-documentales/tipos-documentales.schema.ts | backend/tests/catalogos.schema.test.mjs:3 |
| backend/src/modules/ubicaciones/ubicaciones.schema.ts | backend/src/modules/ubicaciones/ubicaciones.repository.ts:3; backend/src/modules/ubicaciones/ubicaciones.service.ts:5; backend/tests/catalogos.schema.test.mjs:4 |
| backend/src/modules/usuarios/usuarios.schema.ts | backend/tests/admin.schema.test.mjs:6 |
| backend/src/shared/admin/admin.repository.ts | backend/src/modules/siseve/siseve.service.ts:5 |
| backend/src/shared/documental/contexto.ts | backend/src/modules/documentos/auditoria-presentacion.ts:1; backend/src/modules/documentos/delegacion-personal.ts:5; backend/src/modules/documentos/documentos.repository.ts:3; backend/src/modules/documentos/documentos.service.ts:4; backend/src/modules/documentos/documentos.service.ts:48; backend/src/modules/documentos-pdf/pdf.repository.ts:2; backend/src/modules/documentos-pdf/pdf.service.ts:6; backend/src/modules/movimientos/movimientos.repository.ts:2; backend/src/modules/movimientos/movimientos.service.ts:1; backend/src/modules/siseve/siseve.service.ts:7; backend/src/shared/documental/transaccion.ts:1; backend/tests/pdf.test.mjs:20; backend/tests/siseve.test.mjs:4 |
| backend/src/shared/documental/estados.ts | backend/src/modules/documentos/documentos.repository.ts:6; backend/src/modules/movimientos/movimientos.repository.ts:6 |
| backend/src/shared/documental/transaccion.ts | backend/src/modules/dashboard/dashboard.repository.ts:2; backend/src/modules/dashboard/dashboard.service.ts:2; backend/src/modules/documentos/delegacion-personal.ts:4; backend/src/modules/documentos/documentos.repository.ts:4; backend/src/modules/documentos/documentos.service.ts:5; backend/src/modules/documentos/documentos.service.ts:6; backend/src/modules/documentos-pdf/pdf.permissions.ts:1; backend/src/modules/documentos-pdf/pdf.service.ts:5; backend/src/modules/movimientos/movimientos.repository.ts:3; backend/src/modules/movimientos/movimientos.service.ts:5; backend/src/modules/siseve/siseve.service.ts:4; backend/src/modules/siseve/siseve.service.ts:6 |
| backend/src/modules/dashboard/dashboard.repository.ts | backend/src/modules/dashboard/dashboard.service.ts:3 |
| backend/src/modules/dashboard/dashboard.service.ts | .private/performance/medir-backend.mjs:9 |
| backend/src/modules/dashboard/dashboard.types.ts | backend/src/modules/dashboard/dashboard.repository.ts:4; backend/src/modules/dashboard/dashboard.service.ts:4 |
| backend/src/modules/ubicaciones/ubicaciones.repository.ts | backend/src/modules/ubicaciones/ubicaciones.service.ts:4 |
| backend/src/modules/ubicaciones/ubicaciones.service.ts | .private/render/restaurar-node.mjs lo incluye en una lista explícita de readFileSync/writeFileSync |
| backend/src/modules/documentos/documentos.controller.ts | .private/usuario-delegacion-editar.mjs usa editar(ruta,...) con readFileSync/writeFileSync directos |
| backend/src/modules/siseve/siseve.controller.ts | backend/src/modules/siseve/siseve.routes.ts:5 |
| backend/src/modules/siseve/siseve.routes.ts | .private/render/restaurar-node.mjs lo incluye en una lista explícita de readFileSync/writeFileSync |

Los validadores Neon también se conservan: backend/scripts/production-config.mjs y backend/tests/neon.test.mjs los consumen. No se amplía por ello el arranque local del esquema documental.

## Pendientes y límites

- No se realizó una sesión visual de navegador ni se verificó un despliegue. Los recorridos fueron HTTP, SQL y generación/lectura XLSX locales.
- No se repitieron carga/descarga con R2 real ni expiración de URLs por reloj real; tampoco una cancelación de descarga por navegador. No se presentan esos escenarios como aprobados por las suites actuales.
- Las integraciones históricas que exigen esquema anterior, navegador o R2 siguen pendientes según catalogo-pruebas.mjs. No se reactivaron rutas ni se ejecutaron herramientas de restauración/limpieza históricas.
- Retirar el resto de fuentes antiguas requiere resolver o retirar primero sus consumidores privados/manuales concretos. Eso no impidió retirar código redundante demostrado del backend activo.

Evidencias: [manifiesto](qa-limpieza-backend-fase4/manifiesto.json), [grafo y consumidores](qa-limpieza-backend-fase4/grafo-consumidores.json), [referencias privadas actuales](qa-limpieza-backend-fase4/consumidores-privados-actuales.json), [conservación de datos](qa-limpieza-backend-fase4/conservacion-datos.json) y [equivalencia de permisos](qa-limpieza-backend-fase4/permisos-equivalencia.json). Logs finales y resultados de comandos en la misma carpeta.
