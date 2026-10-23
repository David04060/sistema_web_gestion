# Guía de mantenimiento del código

Esta guía describe el código existente del Sistema Web Documental de la I.E. Enrique Paillardelle. No introduce requisitos funcionales nuevos. Los contratos ejecutables siguen definidos por los esquemas Zod, las rutas HTTP, los servicios y las restricciones PostgreSQL vigentes.

## Organización y recorrido de una operación

El backend mantiene `Routes → Controllers → Services → Repositories → PostgreSQL`. Las rutas componen autenticación, límites y autorización; los controladores validan entradas y adaptan HTTP; los servicios comprueban reglas institucionales; los repositorios construyen consultas parametrizadas y proyecciones. Los tipos no sustituyen la validación de datos externos.

Las unidades de trabajo de `shared/admin/admin.repository.ts` y `shared/documental/transaccion.ts`, y las transacciones locales de Dashboard y Ubicaciones, gestionan la conexión y el contexto de auditoría. Su SQL de infraestructura (`BEGIN`, bloqueo asesor, `set_config`, `COMMIT`, `ROLLBACK`) delimita operaciones; las consultas y modificaciones de entidades permanecen en sus repositorios. No se unificaron estas unidades mediante una abstracción genérica: la operación restringida reutiliza una conexión, la administración exige un administrador y el Dashboard utiliza una instantánea de solo lectura. Esas diferencias son necesarias.

El frontend mantiene páginas, componentes, hooks, API y esquemas dentro de `src/features/<módulo>`. `src/api/client.ts` realiza Fetch, acota la espera y valida también las respuestas exitosas. `src/hooks/useConsulta.ts` coordina carga y recarga; descarta resultados de versiones antiguas y limpia los datos anteriores al reautorizar. Los componentes de `src/components/ui/` comparten estados, confirmaciones y presentación sin conocer reglas SQL.

`App.tsx` solo entrega las rutas. `AuthProvider` permanece por encima de `AppRoutes`; los guards preceden al layout y a las pantallas diferidas. Las factorías `React.lazy` se declaran fuera del render. Los límites `Suspense` y `ErrorRuta` conservan carga y recuperación por ruta. Añadir una página no debe convertir todos sus módulos en imports estáticos de la entrada.

## Autenticación

Backend: `modules/auth/` separa esquema, controlador, servicio, repositorio, mapper y tipos. Login normaliza el identificador, conserva literalmente la contraseña y compara con scrypt incluso ante una cuenta inexistente. La respuesta pública omite hash y versión. El middleware exige Bearer y verifica firma, algoritmo, emisor, audiencia, vencimiento, sujeto bigint y versión de autenticación; reconsulta actividad y versión de la cuenta.

Frontend: `AuthSession` coordina la máquina de sesión; `AuthProvider` conecta sus eventos y `useAuth` consume una instantánea estable. Solo el JWT se persiste en `sessionStorage` de la pestaña. Decodificar `exp` programa el cierre local, pero no verifica firma ni sustituye `/me`. El vencimiento original no se prolonga al recargar o recuperar foco. Un contador invalida resultados pendientes después de logout, login o vencimiento. Las revalidaciones simultáneas comparten únicamente la promesa pendiente de la misma operación. El error de red bloquea la vista privada y permite reintentar sin considerar inválido un JWT todavía vigente.

## Roles

`modules/roles/` configura el repositorio y servicio de catálogo compartido. Los controladores conservan endpoints propios; el servicio protege las denominaciones Administrador, Director(a), Secretaria de Dirección y Usuario. La unicidad compara nombres normalizados bajo el bloqueo administrativo.

El frontend configura `CatalogoLista`, `CatalogoDetalle` y `CatalogoFormulario` con la API, ruta y esquema de roles. Compartir presentación no concede privilegios. Las rutas de administración y el backend exigen el rol autorizado.

## Oficinas

Sigue el mismo contrato de catálogo que Roles, con sus archivos y endpoints propios. Dirección y Mesa de Partes son denominaciones reservadas. La consulta de cuentas asociadas facilita comprender las referencias del registro; renombrar una oficina editable conserva su ID. Los formularios reutilizan los componentes de catálogo y la validación específica.

## Usuarios

El backend administra datos personales, rol, oficina, actividad y restablecimiento mediante operaciones diferentes. El servicio comprueba asignaciones institucionales y preserva al último administrador activo. Cambiar actividad o contraseña incrementa la versión de autenticación según la operación existente; no borra autoría, documentos ni historial. Las proyecciones administrativas nunca incluyen hashes.

Las páginas del frontend coordinan consultas, formularios y confirmaciones. `UsuarioForm` valida y normaliza sus datos antes de delegar el guardado. La oficina de Dirección o Mesa de Partes se selecciona de catálogos reales. Cambiar el rol propio requiere la confirmación existente y revalidación; cambiar actividad o contraseña propia cierra la sesión. Los filtros y la página del listado permanecen en la URL.

## Tipos documentales

El servicio preserva nombres y prefijos institucionales, la reserva del tipo restringido y los prefijos con historia. El repositorio no utiliza existencia de documentos o correlativos para revelar actividad de SíseVe: la proyección protegida es constante para tipos restringidos.

`TipoForm` conserva su estado con React Hook Form y valida con Zod; su función de envío se encuentra fuera del JSX. El frontend no genera códigos documentales. La etiqueta de reserva no autoriza edición: Express verifica nuevamente las reglas.

## Ubicaciones

El repositorio filtra en SQL estantes y archivadores según el actor. Administración y Dirección tienen alcance de consulta global de ubicaciones; ese alcance no concede edición ajena a Dirección. El servicio permite modificar al administrador o al responsable, conserva la oficina del estante y el padre del archivador y valida códigos o números duplicados. Mantener un responsable histórico inactivo es distinto de asignarlo nuevamente.

Las cinco pantallas están separadas en `features/ubicaciones/pages/`: listado, detalles de estante y archivador y sus formularios de página. `UbicacionesPages.tsx` conserva las exportaciones de entrada utilizadas por las rutas diferidas. `EstanteForm.tsx` y `ArchivadorForm.tsx` contienen formularios independientes; `UbicacionForms.tsx` mantiene compatibilidad de importaciones. Los hooks descargan únicamente listado, opciones de asignación o estantes disponibles, según la pantalla.

## Documentos

Las consultas distinguen autorización de contenido de autorización de recorrido. El creador, custodio actual o Dirección pueden consultar contenido ordinario según el predicado existente; ser participante histórico no concede ese contenido. Administración técnica no obtiene acceso documental global por su rol. Los endpoints ordinarios excluyen tipos restringidos antes de filas, filtros y totales.

El servicio bloquea la fila antes de evaluar una escritura y revalida al actor. El código y las fechas se generan en PostgreSQL. Mesa de Partes o Secretaría registran `PENDIENTE_DECISION`; el registro ordinario confirma custodia en `RECIBIDO`. La corrección modifica contenido con motivo. La anulación es lógica, cambia a `CANCELADO` y conserva relaciones e historial.

Dirección escribe o retira la tríada de destinatario, oficina y autor de decisión manteniendo `PENDIENTE_DECISION`. La autorización no constituye un movimiento ni una salida física. La salida posterior verifica nuevamente destino y oficina, guarda la decisión histórica en el movimiento y consume la autorización del documento.

El frontend separa consulta inicial, formulario, acciones e historial. Los mensajes de confirmación de detalle permanecen fuera del formulario que puede desmontarse al recargar. Los totales y páginas llegan del backend; no se descarga todo el contenido para calcularlos.

## Movimientos

Cada movimiento empieza con una salida física en `EN_TRASLADO`. El servicio bloquea primero documento y después movimiento, vuelve a consultar el estado y comprueba el actor. Solo el destinatario confirma recepción o rechazo; el origen confirma recuperación o cancelación permitida. Rechazar conserva custodia en origen. Recuperar mantiene el movimiento `RECHAZADO` como antecedente y devuelve el documento a `RECIBIDO`. Cancelar un traslado requiere recuperación confirmada.

Movimiento y documento se confirman en una transacción; los triggers diferidos comprueban coherencia al commit. No invertir el orden de bloqueos ni dividir estas escrituras entre solicitudes. El frontend prepara el contrato de cada hecho físico y pide su confirmación; el servidor vuelve a verificar todas las reglas.

Los cinco estados documentales continúan siendo exclusivamente `PENDIENTE_DECISION`, `EN_TRASLADO`, `RECIBIDO`, `RECHAZADO` y `CANCELADO`. El tipo `EstadoMovimiento` excluye `PENDIENTE_DECISION` porque una decisión todavía no representa traslado.

## SíseVe

El backend exige JWT y cuenta vigente, autorización individual activa y clave adicional en cada operación. La gestión administrativa de permisos y hash no entrega contenido documental. Los límites por cuenta se calculan después de `requiereAuth`; operaciones restringidas y cambio administrativo de clave conservan límites independientes.

`operar` abre una unidad documental, bloquea metadatos de acceso y compara scrypt con una respuesta uniforme si falla cualquier puerta. Solo entonces habilita un contexto de `AsyncLocalStorage` con cliente y tipo restringido, limitado a esa operación. `ejecutar` valida el contrato de la rama y reutiliza los mismos servicios de Documentos y Movimientos. La clave adicional no evita las restricciones de custodia ni crea permisos de Dirección.

El frontend consulta metadatos propios mediante un proveedor compartido, sin descargar contenido ni crear una sesión de desbloqueo. Cada solicitud protegida incluye la clave en el cuerpo y vuelve a exigirla. El formulario limpia el campo antes de ejecutar una solicitud válida. Preparar otra operación no la ejecuta ni reutiliza la clave. Ante errores se descartan resultados y preparación anteriores según la lógica existente.

## Dashboard

El servicio revalida la cuenta dentro de una transacción `REPEATABLE READ READ ONLY`. El repositorio calcula contadores, estados, operaciones y listas acotadas en PostgreSQL. Administración obtiene catálogos; Dirección recibe alcance ordinario institucional y las otras cuentas su alcance autorizado. Las CTE de contenido, recorrido y tareas comparten autorización; SíseVe permanece excluido explícitamente aunque existiera un contexto restringido.

Los autorizados que esperan salida conservan `PENDIENTE_DECISION`; son una operación pendiente, no otro estado. Las listas de actividad e intervención se limitan a ocho entradas. React valida el contrato, presenta los totales y vuelve a consultar al regresar o actualizar. `lib/estados-documentales.ts` centraliza etiquetas de presentación compartidas con `EstadoBadge`; no define transiciones.

## Errores y asincronía

`HttpError` contiene estado y mensaje públicos. El middleware traduce conflictos conocidos y errores del parser; los errores inesperados se responden de forma genérica. No insertar SQL, claves, JWT o cuerpos confidenciales en mensajes de error. `apiRequest` conserva el estado HTTP incluso si un proxy devuelve HTML; solo permite mensajes públicos de errores conocidos y valida todos los 2xx con el esquema esperado. Un 401 con Bearer notifica la sesión correspondiente; un 403 de una operación no revoca por sí mismo la identidad.

`useConsulta` conserva una revisión para descartar resultados antiguos. No retirar su limpieza de datos al recargar: las consultas vuelven a comprobar permisos. Los efectos documentan apertura y limpieza de eventos. `useMenuMovil` conserva el diálogo nativo y el mismo punto de quiebre CSS; el layout solo compone sus controles.

## SQL histórico y pruebas

Los cuatro SQL versionados de `backend/scripts/sql/` se conservan byte por byte. La documentación de sus ocho funciones documentales está en [FUNCIONES_SQL.md](refactorizacion/FUNCIONES_SQL.md); no se añadió `COMMENT ON` ni se aplicó DDL para documentarlas.

Las pruebas unitarias simulan dependencias para verificar contratos y carreras; no equivalen a integración PostgreSQL. Las suites `flujo-migration.integration.mjs`, `dashboard.integration.mjs` y `revision-final.integration.mjs` preparan QA con nombre aleatorio, esquema y catálogos. Las escrituras de esta revisión se ejecutan exclusivamente allí; la limpieza verifica nombre y OID y compara huellas del origen.

Los comandos antiguos `test:admin`, `test:catalogos` y `test:documentos-consultas` utilizan un sandbox transaccional que por defecto permite la base configurada. En esta revisión se ejecutan **solo como regresiones hijas de la suite documental**, con `DATABASE_URL` y `DB_QA_AUTORIZADA` de QA. No ejecutar esos comandos directamente contra el entorno institucional. Se documenta su comportamiento existente sin cambiar sus guardas ni el funcionamiento de la aplicación.

Para comprobar documentación: `node frontend/scripts/auditar-documentacion.mjs --check`. Para guardar el inventario completo: `node frontend/scripts/auditar-documentacion.mjs docs/refactorizacion/inventario-final.json`. El análisis incluye implementaciones, métodos, constructores, accesores y callbacks TS/TSX/MJS de `src`, `tests` y `scripts`. Firmas de tipos, constantes, imports, reexportaciones, CSS y configuración declarativa no son implementaciones de funciones. La comprobación de presencia de JSDoc complementa la revisión de precisión; no puede certificar por sí sola que una explicación sea correcta.
