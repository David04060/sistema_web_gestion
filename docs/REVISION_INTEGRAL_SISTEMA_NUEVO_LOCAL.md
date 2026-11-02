# Revisión integral del sistema documental nuevo — local

Fecha: 1 de noviembre de 2026. Este informe describe las comprobaciones de esta revisión y de su cierre de usabilidad. No reutiliza pruebas del circuito documental retirado como evidencia funcional.

## Dictamen

**Pendiente de pruebas visuales puntuales.** Los recorridos funcionales principales se ejecutaron contra API y PostgreSQL reales y se probó PDF con R2 real. No quedan fallos conocidos en las pruebas ejecutadas. Falta completar por navegador la edición/cambio de actividad de una cuenta de prueba y el recorrido completo de creación/renombrado de campos por Administración; esas operaciones sí pasaron las pruebas HTTP/PostgreSQL con rollback. La última conexión de control del navegador responde `Debugger unattached`, incluso al volver a obtener la pestaña y al usar su lectura accesible. No se presenta la compilación como evidencia visual ni se declara aprobado todo el sistema.

No se requiere desplegar para continuar. El rediseño puede prepararse con estas salvedades, pero la aprobación funcional integral queda pendiente de cerrar esas comprobaciones. No se hizo commit, push ni despliegue.

## Entorno y conservación

- Base: `sistema_web_documental_final`; conexión local `::1`, puerto `5432`; OID `98367`; esquema `public`; rol de conexión `postgres`.
- Catálogo real al cierre: 21 tablas, 21 funciones, 36 triggers no internos y 50 índices. Ningún trigger deshabilitado, restricción sin validar o índice inválido detectado.
- No se creó ni copió una base, no se ejecutó de nuevo el instalador y no se consultó ni modificó la base anterior como referencia de esta revisión. No se accedió a producción para modificarla.
- Se conservaron los cambios locales sin confirmar; no se hizo reset ni se sustituyeron por GitHub. El diff contiene trabajo previo y no debe interpretarse todo como producto de esta revisión.
- Siguen existiendo las cinco cuentas iniciales. La comparación final de IDs, roles, actividad, oficinas y ámbitos coincide con el inventario inicial. No se restablecieron contraseñas ni persistieron nuevas cuentas de prueba.
- Los documentos iniciales 1–6 se conservaron. Las escrituras funcionales se dirigieron a registros marcados de prueba o a fixtures dentro de transacciones revertidas. Los tests de rollback comparan conteo y huella de las 21 tablas antes y después.
- Los IDs consumidos por secuencias durante rollback dejan saltos normales. No se reiniciaron secuencias ni se compactaron IDs.
- Salud del backend, frontend y proxy local: HTTP 200 al cierre. Una petición autenticada al listado por el proxy devolvió 200 y cuatro documentos para `oficinista`.

## Reglas y superficies activas revisadas

El runtime monta autenticación, administración, dashboard, documentos y PDF. Se inspeccionaron sus contratos y las capacidades calculadas por el backend. No se montan operaciones de SíseVe, recepción, aceptación, confirmación de entrega ni movimientos físicos antiguos.

Las operaciones documentales usan transacción, actor revalidado, bloqueo y revisión cuando corresponde. Los correlativos pertenecen al ámbito, tipo y año. La delegación registra un destino y un evento; no transfiere el documento ni concede acceso a la cuenta indicada. La ubicación conserva el propietario de la unidad y su ruta histórica.

### Matriz de permisos y evidencia

N = navegador con inicio de sesión normal; A = HTTP real contra la aplicación y PostgreSQL local; P = comprobación SQL; R = objetos R2 reales. Las pruebas automatizadas autenticadas generan JWT del servidor con la versión vigente de las cuentas; no equivalen a un inicio de sesión normal en navegador. Los datos adicionales de dos Usuarios y las cuentas de actividad son fixtures con rollback.

| Cuenta / rol | Permitido comprobado | Denegado comprobado | Medios y límites |
| --- | --- | --- | --- |
| `administrador` / Administrador | Cuentas ordinarias, oficinas, actividad y campos para Dirección, Secretaría y Usuario; dashboard administrativo | Contenido, historial, auditoría y PDF ajenos; detalle, edición, actividad y contraseña del Superadministrador; crear o convertir otra cuenta a Superadministrador | N: navegación, detalle de cuenta y oficina de prueba; A/P: matriz administrativa y campos. Actividad de cuenta y recorrido completo de campos pendientes en N |
| `directora` / Dirección | Ámbito compartido, decisión para guardar o delegar, ubicaciones propias; lectura y descarga de documentos personales | Modificar documentos/PDF personales ajenos; ver anulados; administración de cuentas | N/A/P/R: registro relacionado emitido con ubicación/PDF, corrección, auditoría, delegación registrada sin oficina, consulta y filtros. A/P: otras variantes y rechazos |
| `secretaria` / Secretaría | Registro recibido/emitido, pendiente por defecto o conservado en Mesa; delegación posterior de lo conservado; PDF compartido aun delegado; lectura personal institucional | Modificación de documentos/PDF personales ajenos; ver anulados; administración de cuentas | N: formulario y detalle de Mesa, delegación manual; envío de registro asistido por el usuario. A/P/R: PDF posterior a delegación, carga y borrado físico. El clic automatizado de confirmación de esa carga no produjo petición, por ello no se cuenta como prueba N aprobada |
| `oficinista` / Usuario, única cuenta real de ese rol | Recibidos/emitidos propios, tipos personales, relacionados, corrección antes de delegar, delegación informativa, lectura propia posterior | Documentos de otros ámbitos aunque sea destinatario; modificar/anular/PDF personal después de delegar; unidades sin oficina; administración | N/A/P/R: registros, PDF, corrección de asunto largo, anulación de prueba, delegación manual y acceso directo denegado a documento 41 |
| Superadministrador, comprobación acotada | Consulta administrativa propia y ajena; anulado 70 | Crear otra cuenta de ese rol o convertir una existente | A/P; no se usó para recorridos documentales ordinarios en N |
| Dos Usuarios de la misma oficina (fixtures revertidos) | Cada uno accede a su ámbito y catálogo | Lectura, historial, auditoría, PDF, tipos y unidades del otro; acceso por destino indicado | A/P reales con rollback; no son dos sesiones de cuentas persistentes |

El Administrador puede recibir un listado documental vacío autorizado por el contrato; no recibe contenido. Un 404 en detalles no autorizados evita revelar su existencia. Los errores de escritura autorizada para lectura conservan su 403; conflictos de revisión, su 409.

## Filtros, búsqueda y códigos coincidentes

- Se añadió `fecha` a `GET /api/documentos`: `YYYY`, `YYYY-MM` o `YYYY-MM-DD`, años 0001–9999. Fechas imposibles devuelven 400.
- El backend convierte la precisión a límites SQL sobre `creado_en` en `America/Lima`, inclusivo inicial y exclusivo final. No se comparan etiquetas formateadas de React.
- Se combina con `q` (código o asunto), clasificación, situación, página y límite. Conteo y filas usan el mismo permiso y filtros.
- La pantalla ofrece día, mes o año, criterios activos y limpieza. Atrás/adelante sincroniza los controles con la URL. Fecha y oficina del registrador ayudan a distinguir resultados, también en tarjetas móviles.
- Los documentos 39 y 40 tienen el mismo código visible `RVINT2026001` en ámbitos distintos. Dirección ve ambas coincidencias; Usuario ve solo la propia. Se comprobaron paginación de límite 1, total, criterios combinados y límites de fecha en Perú. El ID se mantiene como texto para navegar.
- Se comprobaron búsquedas literales de `%` y texto con apariencia SQL sin ampliar resultados ni romper el contrato.

## Hallazgos y correcciones

| Gravedad | Hallazgo / causa | Corrección | Nueva comprobación |
| --- | --- | --- | --- |
| Media | Faltaba filtro de fecha tipado y la disambiguación móvil era insuficiente | Validación gregoriana, límites SQL en Perú, criterios activos, fecha/oficina visibles | A/P: límites, combinación, conteos y paginación; N: día/año Dirección, mes Usuario y coincidencias entre ámbitos |
| Media | Una oficina inactiva podía aceptar nuevas asignaciones por API | Validación de servicio y función PostgreSQL; conserva asignación existente | A/P: alta y reasignación 409, SQL directo rechazado, edición sin cambio de oficina permitida |
| Media | Los temporales nuevos quedaban fuera del prefijo con expiración configurada | Las nuevas claves temporales empiezan por `tmp/qa/pdf-documental-nuevo/`; claves definitivas sin cambios | A/P/R: PUT y confirmación 200, borrado 200, ambos objetos ausentes; regla `tmp/` observada activa |
| Media | Conexiones locales de pruebas o ejecución podían omitir parte de la verificación de destino | Validar URL antes de abrir socket y verificar identidad local en todos los modos locales | Procesos de desarrollo, test y producción rechazan URL local no autorizada antes de conectar |
| Media | Auditoría de dependencias reportó 11 avisos moderados transitivos de desarrollo | Override exacto `minimatch` 11.0.1 y lockfiles actualizados | `npm audit` final: 0 vulnerabilidades en ambos proyectos; tipos/lint/tests/build pasan |
| Baja | Confirmaciones nativas bloqueaban la automatización y salían de la interfaz del sistema | Confirmaciones internas en documento, PDF y actividad/contraseña de cuenta; oficina ya usa confirmación interna | N: delegación, anulación, cancelación/borrado PDF y oficina. Cuenta: A/P y render; recorrido N pendiente |
| Baja | Doble envío y mensajes de navegación/carga PDF poco claros | Guardia inmediata con referencia, botones ocupados y mensajes de registro/corrección/anulación; estado de confirmación PDF | N: doble clic produjo un solo documento 70; corrección muestra éxito; A/P: auditoría y conteos |
| Operativa | El servidor Vite dejó de estar disponible durante la revisión | Reinicio del servidor local existente | HTTP 200 frontend, backend y proxy. No se atribuye a PostgreSQL una causa no reproducida |

## PostgreSQL: único incremental de esta revisión

Se aplicó exclusivamente `database/changes/004-oficinas-inactivas-local.sql` a la base nueva local. Sustituye la definición de `validar_usuario_oficina`, manteniendo las restricciones por rol y oficinas institucionales. Rechaza insertar o cambiar hacia una oficina inactiva; no obliga a retirar cuentas ya asignadas.

La ejecución verificó nombre/host/OID, usó transacción y el bloqueo de configuración. Antes de confirmar se compararon las 21 tablas por conteo y huella: **ninguna fila existente cambió por esta migración**. No se crearon tablas, columnas, índices ni triggers, ni se desactivaron protecciones. La comparación final de funciones con el catálogo inicial identifica exactamente una función cambiada: `validar_usuario_oficina`.

Se sincronizó esa definición en el SQL principal y `database/schema/identidad.schema.sql`; son documentación/instalación futura y no se ejecutaron de nuevo. La evidencia privada conserva checksum y comparación. No se tocaron migraciones anteriores.

## PDF y almacenamiento real

- Bucket existente `documentos-pdf`: Standard, sin dominios públicos configurados y URL pública de desarrollo deshabilitada, observado en Cloudflare sin editar producción.
- CORS observado: orígenes locales autorizados y frontend existente; GET/HEAD/PUT, sin DELETE. El preflight DELETE de navegador devolvió 403.
- Ciclos reales: preparar, PUT, validar/confirmar, visualizar con PDF.js, descargar, reemplazar y eliminar; descarga comparada por SHA-256. La descarga desde navegador se guardó en Downloads aunque la espera automatizada del evento agotó su tiempo.
- PDF falso y metadatos superiores a 15 MiB rechazados; validación de firma/estructura del backend probada. No se usa almacenamiento simulado como sustituto de los ciclos R2.
- Reemplazo concurrente con la misma revisión: solo uno se confirma; el otro devuelve 409. Claves distintas, objeto anterior 404. Eliminación mantiene el documento y deja el objeto 404.
- Fallo de eliminación inyectado de forma controlada: registra pendiente; reintento usa R2 real y completa la limpieza. Fallos de preparación/validación se comprueban por separado con adaptador simulado y no dejan vínculo/auditoría parcial.
- Documento 110 delegado por Secretaría: carga posterior y eliminación comprobadas por API/R2; no se atribuyen a clics del navegador que no produjeron petición.
- Al cierre: **12 cargas de prueba, 10 confirmadas, 2 PDF vigentes** (57 y 69), cero objetos de prueba pendientes de limpieza excluyendo los dos vigentes. Las filas de referencias incluyen intentos que nunca crearon objeto; no son versiones históricas del contenido.
- Reglas de ciclo de vida observadas activas: `tmp/` y el prefijo temporal antiguo autorizado, un día. Se verificó la correspondencia del nuevo prefijo con `tmp/`; no se esperó 24 horas ni se afirma haber observado su ejecución automática.

## Pruebas técnicas ejecutadas

| Comando / conjunto | Resultado | Naturaleza |
| --- | --- | --- |
| Backend `npm run typecheck`, `npm run lint`, `npm run build` | Aprobados | Código y compilación |
| Backend `npm test` | 30 pasan | Contratos, seguridad HTTP/auth, SQL nuevo y almacenamiento con adaptador; no todo es integración R2 |
| Backend `npm run test:revision:local` | 34 pasan | HTTP + PostgreSQL local, fixtures revertidos y huellas de conservación |
| `revision-r2-local.integration.mjs` | 5 pasan | Suite ejecutada con R2 real; crea pruebas persistentes identificadas, no reejecutar ciegamente |
| `revision-concurrencia-local.integration.mjs` | 1 pasa | Correlativos concurrentes y revisión de corrección contra API/PG reales |
| Ciclo focalizado de temporal corregido, documento 39 | Aprobado | PUT/confirmación/eliminación reales y ausencia física |
| Ciclo focalizado Secretaría delegada, documento 110 | Aprobado | API/PG/R2 reales |
| Frontend `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` | Aprobados; 58 pruebas pasan | Contratos, estado de sesión, render y regresiones; no acredita responsive |
| `npm audit`, ambos proyectos | 0 vulnerabilidades reportadas | Snapshot del registro de dependencias, no certificación universal |
| `git diff --check` | Sin errores de espacios | Advertencias normales de normalización LF/CRLF |

El primer intento de lanzar procesos de test dentro del sandbox falló con `spawn EPERM`. Se repitieron con ejecución permitida y pasaron; ese intento no se cuenta como resultado funcional. El mensaje de error interno en la prueba de repositorio simulado es el fallo inyectado esperado.

## Comprobaciones visuales y de interacción reales

- Administrador: menús sin contenido documental, detalle de cuenta por enlace y acción visible; oficina de prueba, edición separada, confirmación interna, cancelar, desactivar/reactivar y actualización de la vista.
- Dirección: filtros, coincidencias de código, límite 1 y paginación; lugares/contenido, registro relacionado con PDF/ubicación, corrección con motivo, historial resumido y auditoría; delegación a cuenta sin oficina; visor, descarga, reemplazo y borrado de prueba.
- Usuario: documentos propios, acceso directo al 41 denegado, recibido/emitido, documento relacionado y PDF, corrección de asunto largo, anulación lógica de prueba, delegación manual sin transferencia.
- Secretaría: pendiente por defecto, selección de Mesa, registro 110 (confirmación final pulsada por el usuario por un fallo de control de la pestaña), detalle y delegación manual posterior sin F5. PDF seleccionado previsualizado; la posterior confirmación fue comprobada por API, no por navegador.
- Anchos emulados de 390, 820 y 1440 px: tarjetas, filtros y asuntos largos legibles; mediciones de ancho de página iguales al disponible (375/375, 805/805 y 1425/1425). Registro y visor PDF móvil se revisaron en el cierre de usabilidad. No se usaron dispositivos físicos.
- Se usó teclado para navegación, envío de búsqueda y controles de visor; no se hizo una certificación completa WCAG ni un recorrido de todas las combinaciones de lector de pantalla.
- Las capturas privadas conservadas son `pdf-movil.png`, `filtros-fecha-movil.png`, `asunto-largo-movil.png`, `confirmacion-oficina-movil.png` y `oficina-reactivada-movil.png` bajo `.private/usabilidad/`.

## Datos de prueba que persisten

Todos estos documentos llevan `PRUEBA REVISIÓN INTEGRAL` en el asunto. Se dejan identificados, sin borrarlos indiscriminadamente.

| ID | Registrador | Estado final | Uso |
| --- | --- | --- | --- |
| 39 | Secretaría | Pendiente Dirección | Recibido, PDF real y ciclos de limpieza; sin PDF al cierre |
| 40 | oficinista | Delegado manual | Mismo código que 39 en ámbito personal; sin transferencia |
| 41 | Secretaría | Delegado a oficinista | No aparece ni concede acceso al destinatario |
| 42 | Secretaría | Delegado | Concurrencia; una delegación confirmada |
| 43 | Secretaría | Pendiente Dirección | Emitido y asunto largo |
| 44 | Secretaría | Pendiente Dirección | Corrección concurrente; una modificación ganadora |
| 57 | Dirección | Guardado Dirección | Emitido relacionado con 39, ubicación y PDF vigente |
| 69 | oficinista | Personal | Emitido relacionado con 40, asunto de 1823 caracteres y PDF vigente |
| 70 | oficinista | Anulado | Recibido de prueba; oculto salvo Superadministrador |
| 110 | Secretaría | Delegado manual | Emitido conservado en Mesa y delegado después; PDF probado y eliminado |

Total actual: 16 documentos, uno anulado. Una delegación en cada documento 40, 41, 42 y 110; ninguna duplicada por los envíos de prueba. Persisten tipos 15 y 16 con prefijo RVINT en ámbitos diferentes, y unidades 41/42 de Dirección (lugar y contenido). La oficina 10 `PRUEBA LOCAL — Usabilidad revisada 01-11` pertenece a la etapa de usabilidad anterior; queda activa y sin asignaciones.

No quedan campos ni cuentas adicionales persistentes de esta revisión. Los dos PDF vigentes de prueba son `previsualizacion-local.pdf`, 1306 bytes, vinculados a 57 y 69. Las claves y manifiestos privados quedan fuera de Git; no se incluyen URLs firmadas ni credenciales en este informe. Hay una descarga local de prueba con ese mismo nombre en Downloads.

## Archivos principales de esta intervención

- Backend: `src/modules/documentos/fecha-registro.ts`, `documentos.operaciones.ts`, `src/modules/usuarios/administracion.operaciones.ts`, `src/modules/documentos-pdf/pdf.documental.ts`, `src/config/database.ts`; manifests/lockfiles y pruebas de revisión integral, concurrencia y R2.
- Frontend: `DocumentosListaPage.tsx`, `DocumentoFormularioPage.tsx`, `DocumentoDetallePage.tsx`, `ArchivoPdf.tsx`, `UsuarioDetallePage.tsx`, `api/documental.ts`, `Admin.module.css`, manifests/lockfiles y tests de detalle. Se conservan los ajustes anteriores de oficinas, usuarios, ubicaciones y previsualización.
- Esquema: `database/changes/004-oficinas-inactivas-local.sql`, SQL principal, `database/schema/identidad.schema.sql`, `database/README.md`.
- Documentación: este informe y enlaces de estado desde la documentación backend/usabilidad. Evidencia técnica detallada en `backend/.private/revision-integral/`, excluida de Git.

## Límites y continuación

No se probaron cambios reales de contraseña, cuentas institucionales desactivadas, producción, carga masiva, dispositivos físicos, expiración de temporales tras 24 horas ni todas las pantallas con lector de pantalla. No se crearon cuentas persistentes para sortear la falta de un segundo Usuario real.

La conexión local usa `postgres`, con privilegios superiores a los necesarios para una aplicación. No se cambió esa configuración ni se crearon roles sin pedido. Antes de una futura publicación corresponde revisar un rol de aplicación limitado; este trabajo no autoriza usar las credenciales locales en producción. El bloqueo global de configuración mantiene consistencia, pero esta revisión no certifica rendimiento bajo carga.

Para cerrar el dictamen visual basta restablecer la conexión del navegador y usar Administración para los dos recorridos pendientes sobre datos identificados de prueba, repitiendo sus comprobaciones afectadas. No hace falta usar el Superadministrador para esos recorridos ni volver a ejecutar las suites que crean documentos y tipos persistentes.
