# Revisión integral final del Sistema Web Documental

Fecha de ejecución: **22 de octubre de 2026**, zona America/Lima.

## Dictamen

Los diez módulos funcionaron en las pruebas locales automatizadas, HTTP, PostgreSQL y navegador descritas en este informe. Se corrigieron defectos de confirmación visual y accesibilidad y una desviación de separación de capas. No se reprodujeron errores funcionales pendientes en los procesos probados.

**No se declara el entorno listo para habilitación institucional sin pendientes:** la conexión configurada del backend utiliza un rol PostgreSQL superusuario con permiso de crear bases y la base institucional no tiene configurada la clave adicional de SíseVe. No se alteraron esos permisos ni se creó una contraseña institucional durante la revisión.

La evaluación es de preparación funcional local y QA, no una autorización de publicación ni una certificación de seguridad, rendimiento o operación en producción.

## 1. Estado por módulo

| Módulo | Estado y evidencia |
| --- | --- |
| Autenticación y sesiones JWT | Verificado: login real, recuperación con `/me`, expiración absoluta, firma inválida, vencimiento, cuenta inactiva, cambio de contraseña y revocación por versión; logout y redirecciones en navegador. |
| Roles | Verificado: lista, alta, detalle y edición; nombres institucionales reservados; HTTP restringido al Administrador y bloqueo de rutas React para otros perfiles. |
| Oficinas | Verificado: lista, alta, detalle y edición; reservas institucionales, asignaciones de usuarios y restricciones administrativas. |
| Usuarios | Verificado: alta por API e interfaz, rol/oficina válidos, consulta, edición, filtros y paginación de servidor, desactivación, reactivación y contraseña; protección del último Administrador mediante regresión existente. |
| Tipos documentales | Verificado: catálogo, consulta, búsqueda, alta y edición no reservada por interfaz; prefijos usados e institucionales protegidos; SíseVe no revela existencia de documentos mediante su protección de prefijo. |
| Ubicaciones físicas | Verificado: estantes y archivadores propios, altas y ediciones por API e interfaz; oficina fija; responsabilidad, unicidad y restricciones entre usuarios/oficinas. |
| Documentos | Verificado: código SQL, registro, búsqueda literal, filtros, paginación, corrección con motivo, anulación lógica, historial y límites de custodia/consulta. |
| Movimientos documentales | Verificado: salida, recepción, derivación posterior, rechazo, recuperación y cancelación; bloqueo de acciones incompatibles, transacciones, concurrencia y conservación de recorrido. |
| SíseVe | Funcional verificado en QA: autorización individual más clave en cada operación, revocación, rotación, exclusión general, auditoría protegida y límites por cuenta. **Configuración institucional pendiente de clave adicional.** |
| Dashboard | Verificado: indicadores reales de PostgreSQL, alcance administrativo/institucional/personal, operaciones pendientes, actividad autorizada, aislamiento y exclusión de SíseVe. |

## 2. Procesos completos comprobados

La nueva suite `revision-final.integration.mjs` crea únicamente una cuenta Administrador de arranque mediante SQL en la base QA vacía; el resto de las cuentas se crean mediante el endpoint real de Usuarios y luego inician sesión con sus credenciales QA. No se copian cuentas ni documentos institucionales a QA.

El proceso HTTP comprobó:

1. Crear cuentas con rol y oficina; iniciar sesión y comprobar `/me`.
2. Registrar y editar estantes y archivadores.
3. Registrar un documento ordinario y obtener su código generado por PostgreSQL.
4. Buscar con `%` y `_` literales, paginar y corregir con motivo.
5. Denegar lectura y modificación a un usuario ajeno y negar acceso global al Administrador técnico.
6. Trasladar el documento a Mesa de Partes, recibirlo y solicitar decisión.
7. Denegar autorización a Secretaría y autorizar con Dirección, conservando `PENDIENTE_DECISION`.
8. Denegar la salida al Director que no es custodio y permitirla a Mesa de Partes.
9. Recibir con el destinatario y asignar su archivador propio.
10. Derivar posteriormente, rechazar con motivo y recuperar en origen.
11. Cancelar otro traslado con confirmación de recuperación física.
12. Consultar historial y recorrido; comprobar indicadores después de las acciones.
13. Desactivar al custodio y comprobar conservación del documento, responsable y archivador; reactivar sin rehabilitar su JWT anterior.
14. Restablecer contraseña, rechazar el JWT anterior y la credencial anterior y aceptar la nueva.
15. Alcanzar el límite real de login y comprobar que las sesiones autenticadas existentes continúan usando los endpoints autorizados.

Además, Chrome ejecutó mediante formularios reales un circuito documental independiente: registro y corrección → salida a Mesa → recepción → solicitud de decisión → autorización de Dirección → salida autorizada → recepción → derivación posterior → rechazo → recuperación → nueva salida → cancelación. La persistencia de cada operación se verificó a través de sus páginas y de Express/PostgreSQL QA.

La suite integral existente añadió pruebas de SQL directo, restricciones diferidas, auditoría y concurrencia con doce conexiones, así como los procesos de SíseVe con clave por operación y sus denegaciones HTTP.

Se mantuvieron exclusivamente los estados `PENDIENTE_DECISION`, `EN_TRASLADO`, `RECIBIDO`, `RECHAZADO` y `CANCELADO`. La autorización de Dirección es una condición dentro de `PENDIENTE_DECISION`, no otro estado.

## 3. Problemas encontrados y correcciones

### Confirmaciones desaparecían tras una operación documental

**Causa:** Documentos y Movimientos guardaban el mensaje de éxito dentro del componente de acciones. Después de la mutación, `useConsulta.recargar()` limpiaba el detalle para volver a autorizar y cargar; eso desmontaba el formulario y borraba su mensaje. La recepción se confirmaba en PostgreSQL pero la interfaz perdía la confirmación, especialmente cuando ya no existían acciones disponibles.

**Corrección:** el mensaje se conserva en la página de detalle, fuera del formulario que se desmonta, y se asocia al identificador del registro. No se cambió el comportamiento de `useConsulta`, el vaciado de datos al recargar ni los permisos. Los componentes comunican la confirmación al padre.

**Verificación:** el nuevo flujo de Chrome reprodujo la ausencia del mensaje antes de la corrección y después esperó con éxito las confirmaciones de solicitud, autorización, recepción, rechazo, recuperación y cancelación. También se ejecutaron TypeScript, ESLint, compilación y regresiones frontend.

### Referencias ARIA a mensajes inexistentes

**Causa:** los formularios de Usuarios y de los catálogos Roles/Oficinas establecían `aria-describedby` aunque el mensaje de error correspondiente no estuviera montado.

**Corrección:** añadir esa referencia únicamente cuando existe el error. Se mantuvieron los mensajes, los identificadores y las validaciones existentes.

**Verificación:** la matriz de navegador comprueba controles visibles sin etiqueta y referencias `aria-describedby` que apunten a identificadores inexistentes; ambas comprobaciones pasaron en las pantallas privadas examinadas.

### Consultas de contexto del Dashboard dentro del servicio

**Causa:** el servicio contenía los `SELECT` de oficina y fecha además de coordinar la transacción y decidir el alcance.

**Corrección:** mover ambos metadatos al repositorio del Dashboard mediante una consulta parametrizada, conservando la misma conexión e instantánea. El servicio conserva la coordinación transaccional y las reglas de presentación.

**Verificación:** TypeScript, ESLint, compilación, suite del Dashboard e integración HTTP final aprobados.

### Etiqueta imprecisa en el detalle de movimiento

El campo que mostraba el identificador de quien recibió se titulaba “Fecha y usuario de recepción”, aunque la fecha ya aparecía por separado. Se corrigió a “Usuario que confirmó la recepción”. No se modificaron datos ni contratos.

### Documentación desactualizada

El README enumeraba solo seis módulos backend y conservaba una afirmación histórica de ausencia de módulos documentales. Se actualizó el inventario y se aclaró el alcance del cierre de sesión. Las evidencias históricas se conservan como tales.

## 4. Seguridad y permisos

Comprobaciones realizadas mediante HTTP directo, sin depender del menú:

- Ausencia de JWT: 401 en los endpoints protegidos de los diez módulos.
- JWT modificado o vencido: 401; contratos de firma, emisor, audiencia, versión y bigint cubiertos también por regresión.
- Usuario ordinario, Secretaría y Dirección sin acceso a administración de Usuarios, Roles, Oficinas o SíseVe.
- Cuenta desactivada y JWT anterior a un cambio de contraseña o a un ciclo desactivar/reactivar: rechazados.
- Documentos ajenos: no aparecen en consultas ni se permiten detalle, historial o modificación sin autorización.
- Dirección consulta contenido ordinario institucional pero no puede ejecutar una salida por el solo hecho de ser Director.
- Secretaría solicita decisión y realiza la salida física como custodio; no registra la autorización de Dirección.
- El Administrador no obtiene contenido confidencial ni estadísticas documentales globales por su rol técnico.
- IDs inexistentes, ajenos y fuera del rango bigint no amplían acceso ni producen errores de conversión internos.
- SíseVe se excluye de documentos, conteos, filtros, historial, movimientos, estadísticas y actividad generales. El catálogo de ubicaciones no devuelve sus documentos asociados.
- La autorización SíseVe no sustituye permisos de contenido/custodia. Conocer la clave sin autorización individual tampoco concede acceso.
- Cada operación SíseVe exige clave; no se crea una sesión de desbloqueo. Revocación y rotación se comprobaron en HTTP.
- Límites reales: login por IP, diez solicitudes cada quince minutos; SíseVe por cuenta con respuestas fallidas contabilizadas y prueba de aislamiento entre cuentas de la misma IP.
- Validación estricta y SQL parametrizado; errores internos devuelven mensajes públicos sin SQL, contraseñas ni hashes. Límite de JSON de 100 KB y encabezados Helmet cubiertos por regresión.

No se detectó una fuga reproducible de SíseVe en las consultas y procesos probados.

**Riesgos y pendientes que no se modificaron:**

| Prioridad | Hallazgo | Estado |
| --- | --- | --- |
| Alta | La conexión actual de la aplicación tiene `rolsuper=true` y `rolcreatedb=true`. Una vulnerabilidad de la aplicación tendría un impacto mayor sobre PostgreSQL. | Pendiente de definir y autorizar credenciales de aplicación con privilegios mínimos, separadas de las credenciales QA/mantenimiento. No se ejecutaron `CREATE ROLE`, `GRANT`, `REVOKE` ni cambios del entorno privado. |
| Operativo, bloquea SíseVe institucional | No existe clave adicional institucional configurada para SíseVe. El servicio falla cerrado ante operaciones sin configuración. | Pendiente de configuración privada por el Administrador y de decidir sus autorizaciones institucionales. No se reutilizó ninguna clave QA. |
| Limitación existente | Logout limpia la sesión del navegador, pero no revoca en servidor una copia del JWT. Su duración es de 900 segundos; inactividad y cambios de contraseña sí invalidan por versión. | Política existente conservada. Cualquier revocación individual o cambio de almacenamiento requiere una decisión de seguridad distinta. |
| Dependiente del despliegue | Los limitadores utilizan memoria del proceso; login comparte cupo por IP. No se ensayó una topología con varios procesos ni una configuración de proxy/TLS de producción. | No se cambió la política ni se configuraron proxies confiables por inferencia. |

No se cambiaron reglas institucionales ni se introdujeron excepciones para facilitar las pruebas.

## 5. Estado de PostgreSQL

Se verificó la identidad `sistema_web_final` mediante lecturas. La auditoría agregada actual registró:

| Comprobación | Resultado |
| --- | --- |
| Claves foráneas declaradas en public | 32 |
| Triggers de aplicación presentes | 32 |
| Restricciones no validadas | 0 |
| Triggers deshabilitados | 0 |
| Estados documentales ajenos a los cinco aprobados | 0 |
| Archivadores incompatibles con responsable/oficina documental | 0 |
| Tríadas de autorización incompletas o incompatibles con estado/actividad | 0 |
| Documentos en traslado sin movimiento abierto correspondiente | 0 |
| Más de una circulación abierta por documento | 0 |
| Códigos ausentes o duplicados | 0 |

Los datos institucionales se inspeccionaron únicamente mediante consultas agregadas. Los resultados cero describen el estado observado y no sustituyen la prueba de cada regla con fixtures; para ello se utilizaron las bases QA.

El preparador QA copia el esquema y catálogos, genera un nombre efímero con UUID y comprueba su identidad antes de eliminarlo. La revisión nueva exige que el esquema aprobado ya exista: no usa la alternativa de aplicar DDL institucional. Las escrituras y los COMMIT de pruebas ocurrieron solo en QA. Se compararon estructura y huellas de registros institucionales antes y después y permanecieron iguales. Las bases temporales de las ejecuciones terminadas se eliminaron.

No se realizaron cambios de esquema, escrituras experimentales ni operaciones destructivas en `sistema_web_final`. No se realizó un simulacro de restauración de un backup institucional completo; preparar QA desde esquema y catálogos no constituye ese simulacro.

## 6. Pruebas y resultados

| Tipo | Comprobación | Resultado |
| --- | --- | --- |
| Estático | TypeScript backend y frontend | Aprobado |
| Estático | ESLint backend y frontend | Aprobado |
| Compilación | `tsc` backend y `tsc -b && vite build` frontend | Aprobado |
| Automatizado con dobles de prueba | `npm test` backend | 27 pruebas aprobadas |
| Automatizado de contratos y sesión | `npm test` frontend | 40 pruebas aprobadas |
| HTTP + PostgreSQL QA | Suite integral documental existente | 35 pruebas aprobadas |
| HTTP + PostgreSQL QA | Regresiones administrativas, catálogos y consultas invocadas por la suite integral | 14 + 14 + 5 pruebas aprobadas |
| HTTP + PostgreSQL QA | Dashboard | 10 pruebas aprobadas |
| HTTP + PostgreSQL QA + Chrome | Revisión final nueva | 12 pruebas aprobadas, contando la prueba principal y sus once subcasos |
| Navegador automatizado | Matriz de 37 pantallas/rutas con perfil, incluidos login y 404 | 74 comprobaciones de viewport: 1440 y 390 píxeles |
| Navegador automatizado | Controles etiquetados y referencias ARIA en pantallas privadas | Aprobado |
| Navegador automatizado | Ciclo documental, altas/ediciones administrativas, confirmaciones, filtros, rutas directas y logout | Aprobado |
| Lectura PostgreSQL institucional | Identidad, integridad agregada, privilegios y configuración SíseVe | Completado; pendientes documentados |

Los conteos de Node incluyen pruebas principales y subpruebas; no deben sumarse como si cada una fuera un proceso institucional independiente. Los procesos invocados se detallan en las evidencias.

Las pruebas de navegador son automatizadas en Chrome real con React/Vite → proxy → Express → PostgreSQL QA. No se simularon los datos del servidor para esos flujos. Se inspeccionaron visualmente capturas representativas de los formularios móviles de Usuarios y Documentos. Esa inspección del agente no equivale a aceptación manual por personal de la institución.

La matriz cubre todas las familias de pantallas existentes, incluidas altas, detalles y ediciones; los perfiles Director, Secretaría y destinatario participan además en el circuito interactivo. No se afirma haber probado todas las combinaciones posibles de perfil, dato y viewport.

La accesibilidad comprobada es básica: etiquetas, referencias descriptivas, mensajes de estado, foco visible existente y confirmaciones mediante diálogo nativo. No es una auditoría completa WCAG ni una sesión con lectores de pantalla.

Evidencias:

- `docs/RESULTADOS_REVISION_FINAL.json`: auditoría agregada, casos y matriz de navegador, limpieza QA.
- `docs/RESULTADOS_INTEGRACION_DOCUMENTAL.json`: integración y concurrencia existentes.
- `docs/RESULTADOS_SISEVE.json`: controles restringidos existentes.
- `backend/.private/revision-final/`: capturas de QA excluidas por `.gitignore`.

Los dos JSON de suites anteriores conservan la fecha interna fija de su verificador original; la ejecución actual está fechada en `RESULTADOS_REVISION_FINAL.json` y en este informe.

## 7. Archivos modificados o añadidos en esta revisión

Cambios de aplicación:

- `frontend/src/features/documentos/components/DocumentoAcciones.tsx`
- `frontend/src/features/documentos/pages/DocumentoDetallePage.tsx`
- `frontend/src/features/movimientos/components/MovimientoAcciones.tsx`
- `frontend/src/features/movimientos/pages/MovimientosPages.tsx`
- `frontend/src/features/usuarios/components/UsuarioForm.tsx`
- `frontend/src/components/ui/CatalogoPages.tsx`
- `backend/src/modules/dashboard/dashboard.repository.ts`
- `backend/src/modules/dashboard/dashboard.service.ts`

Verificadores y documentación:

- `backend/tests/revision-final.integration.mjs` — nuevo.
- `backend/tests/revision-final.browser.mjs` — nuevo.
- `backend/package.json` — nuevo comando `test:revision-final`.
- `README.md` — inventario actualizado y enlace a esta revisión.
- `docs/REVISION_FINAL.md` — este informe.
- `docs/RESULTADOS_REVISION_FINAL.json` — nueva evidencia generada.
- `docs/RESULTADOS_INTEGRACION_DOCUMENTAL.json` y `docs/RESULTADOS_SISEVE.json` — regenerados por sus suites existentes.

No se instalaron dependencias ni se cambió el diseño por razones estéticas. Playwright y Chrome se utilizaron desde las instalaciones locales disponibles, fuera de las dependencias de la aplicación.

## 8. Reproducción

En backend:

```powershell
npm run typecheck
npm run lint
npm run build
npm test
npm run check:db
npm run test:dashboard
npm run test:revision-final
$env:VALIDAR_FLUJO_DOCUMENTAL='ROLLBACK_Y_QA_AISLADA'
node --test tests/flujo-migration.integration.mjs
```

En frontend:

```powershell
npm run typecheck
npm run lint
npm run build
npm test
```

Las integraciones QA requieren acceso local para crear/eliminar su propia base efímera, `pg_dump`/`psql` de PostgreSQL 18 y el esquema institucional aprobado. El verificador de navegador utiliza Chrome y el Playwright del runtime local de Codex mediante una ruta absoluta; debe adaptarse ese import en otro equipo. No es una dependencia añadida al producto.

## 9. Preparación para uso institucional y pendientes

**Funcionalidad local/QA:** apta para continuar con un piloto controlado, con los diez módulos y procesos ensayados funcionando después de las correcciones.

**Habilitación institucional:** pendiente de separar las credenciales PostgreSQL de aplicación de las de mantenimiento/QA y de configurar privadamente la clave y los permisos SíseVe. Esos cambios requieren intervención autorizada; no se aplicaron en esta revisión.

**Validación operativa posterior:** no se ensayaron aquí publicación, TLS/proxy de producción, carga sostenida, respaldo/restauración integral ni aceptación con documentos y personal institucional. No deben presentarse como completados.

No se publicó el sistema ni se realizaron commit o push. El directorio de trabajo no contiene `.git`; por ello el manifiesto identifica los cambios realizados durante la sesión y no pretende ser un diff de Git.
