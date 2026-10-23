# Módulo SíseVe: implementación y verificación

Fecha: 21 de octubre de 2026 (America/Lima). Alcance: registros de documentos físicos restringidos. No se agregaron estados, cargas digitales ni dependencias.

## Decisión de códigos y PostgreSQL

La inspección encontró las tablas existentes `autorizaciones_tipos_restringidos` y `claves_tipos_documentales`, sus claves foráneas, unicidad por usuario/tipo, estado activo y fechas de autorización/revocación. También existen triggers de modificación y auditoría general que excluyen `clave_hash`.

Inicialmente SíseVe tenía `prefijo_codigo=NULL`. El generador `fn_documentos_generar_codigo()` rechaza tipos sin prefijo. Se consultó al usuario y eligió expresamente `siseve`; se normalizó a **SISEVE** conforme a las reglas del catálogo. Se aplicó únicamente la actualización de datos `backend/scripts/sql/20261021-siseve-prefijo.sql`, conservando `requiere_clave=true`. No hubo DDL ni modificaciones de funciones, tablas, CHECK, índices o estados.

Antes de actualizar se creó el respaldo privado `backend/.private/backups/antes-siseve-prefijo-20261021.dump` y se comprobó su catálogo mediante pg_restore --list. No se realizó un simulacro de restauración. La asignación quedó auditada con el actor administrativo existente. El resultado está en PREFIJO_SISEVE_APLICADO.json.

El código utiliza el generador y correlativo existentes: SISEVE + año America/Lima + consecutivo, por ejemplo SISEVE2026001. No hay generador paralelo ni códigos manuales. El catálogo ordinario sigue protegiendo el nombre y prefijo reservados.

## Arquitectura

Routes → Controllers → Services → Repositories → PostgreSQL.

- `modules/siseve`: contratos Zod, autenticación, autorización administrativa, límite por cuenta, gestión de permisos/clave y adaptación de operaciones.
- `shared/documental/contexto.ts`: contexto asíncrono efímero de una operación verificada, con su conexión transaccional. El tipo restringido se pasa como parámetro a set_config local; no se interpola en SQL.
- `shared/documental/transaccion.ts`: reutiliza la unidad de trabajo exterior cuando SíseVe llama a los servicios documentales. Evita abrir otra transacción o conexión y conserva actor/motivo.
- Repositorios de Documentos y Movimientos: conservan los mismos permisos de lectura/custodia. El ámbito por defecto excluye restringidos; únicamente el contexto ya validado selecciona el tipo SíseVe.
- Frontend: páginas separadas de administración y responsables, formulario de operación, resultado, API, esquemas, hook del permiso propio y CSS Module.

No se duplican reglas de circulación. La puerta SíseVe delega en los servicios existentes de Documentos y Movimientos, con los mismos DTO, locks, motivos, cinco estados y auditoría.

## Autorización por cada operación

Cada POST protegido verifica, en este orden de responsabilidad:

1. JWT vigente y cuenta activa mediante el middleware existente.
2. Autorización individual activa para el tipo SíseVe, leída de PostgreSQL.
3. Contraseña adicional mediante scrypt.
4. Permisos ordinarios de lectura, autoría, custodia, Dirección o participación histórica según la operación.

Conocer la clave no concede autorización individual. El Administrador gestiona permisos/configuración, pero no obtiene contenido por su rol. Dirección necesita autorización individual y clave antes de ejercer su consulta institucional o su decisión de derivación. Ningún autorizado obtiene edición global por superar la comprobación adicional.

El contexto existe exclusivamente durante la llamada verificada. AsyncLocalStorage aísla solicitudes concurrentes; no es una sesión, un token adicional ni un desbloqueo. No se devuelve una credencial reutilizable. La revocación y la rotación comparten el bloqueo administrativo/transaccional con las operaciones; cuando confirman, las nuevas solicitudes vuelven a leer el estado actualizado. Una operación que comenzó antes puede terminar antes de confirmarse la revocación. La información ya entregada a un usuario autorizado no puede retirarse retroactivamente.

## Contraseña compartida

Se reutilizan `generarHash` y `verificarContrasena`: scrypt N=16384, r=8, p=1, sal aleatoria de 16 bytes y derivación de 64 bytes; comparación de buffers de longitud igual mediante timingSafeEqual. Se admite contraseña nueva literal de 8 a 1024 caracteres, sin recortarla. La rotación rechaza reutilizar la contraseña actual y sustituye su hash. Ningún endpoint devuelve contraseña o hash.

El verificador utiliza una derivación de comparación de reserva si falta configuración; los rechazos por permiso o clave tienen el mismo mensaje público. Los triggers existentes omiten hashes de la auditoría y registran el cambio de configuración.

React solicita la contraseña en cada operación, la envía exclusivamente en el cuerpo y vacía el campo antes de esperar la respuesta. No se usa localStorage, sessionStorage, URL ni estado de desbloqueo para esta clave. Se conservan resultados autorizados en memoria de la vista; se limpian antes de otra operación y ante errores. La selección del permiso propio solo configura menú/interfaz y nunca sustituye la verificación.

En despliegue, interfaz y API deben servirse mediante HTTPS; el body JSON no cifra por sí mismo el tráfico. La QA local se ejecutó mediante HTTP en loopback. No se modificó ni desplegó infraestructura TLS en esta tarea.

## Límite de intentos

`POST /api/siseve/operaciones`: 10 solicitudes fallidas por cuenta autenticada en 15 minutos; las respuestas exitosas se descuentan. También cuentan otros errores de esa operación, no solo una clave incorrecta. Al superar el límite se responde 429. Una cuenta no bloquea a las demás personas de la misma IP.

La configuración/rotación tiene un límite adicional de 30 solicitudes por cuenta administradora en 15 minutos. El almacenamiento del limitador es el MemoryStore existente de express-rate-limit: se reinicia al reiniciar el proceso y no coordina distintas instancias. No se introdujo otro almacén ni dependencia.

## Endpoints

Todos requieren JWT y envían `Cache-Control: no-store, private` y `Pragma: no-cache`.

| Método | Ruta | Finalidad y entrada |
|---|---|---|
| GET | /api/siseve/acceso | Solo el permiso propio, tipo institucional y capacidades básicas; no documentos ni conteos |
| GET | /api/siseve/administracion | Administrador: usuarios, autorizaciones, fechas y estado de configuración, sin hash |
| PUT | /api/siseve/autorizaciones | Administrador: `{usuario_id, activo}`; conserva la fila y audita concesión/revocación |
| PUT | /api/siseve/clave | Administrador: `{contrasena}`; configuración inicial o rotación distinta |
| POST | /api/siseve/operaciones | `{clave, operacion, id?, datos?}`; valida ambos controles y el DTO específico |

Las operaciones protegidas disponibles son: listar, detalle, historial, opciones, registrar, corregir, anular, autorizar, retirar-autorizacion, solicitar-decision, movimientos, movimiento, salir, recibir, rechazar, recuperar y cancelar.

`datos` reutiliza los campos de los endpoints documentales correspondientes descritos en DOCUMENTOS_MOVIMIENTOS.md. Las consultas detalle/historial/opciones/movimiento solo aceptan un objeto vacío en datos. Para registrar se exige el tipo institucional SíseVe; no se puede utilizar la puerta para operar documentos ordinarios. La respuesta protegida es `{resultado: ...}` con los mismos contratos documentales existentes. Todas estas operaciones responden 200 cuando se completan; 400 indica entrada inválida, 401 JWT no válido, 403 verificación/permisos denegados, 404 recurso no visible/inexistente, 409 conflicto y 429 límite.

Rutas React: `/siseve` para responsables autorizados y `/siseve/administracion` para administración. Los resultados ofrecen preparación de consulta, corrección, historial, recorrido y operaciones permitidas. Preparar una acción no envía una solicitud ni reutiliza la clave.

## Protección frente a consultas alternativas

Los endpoints ordinarios siguen excluyendo tipos restringidos antes de filas, conteos, filtros, detalles, historial y movimientos, incluso para Dirección y Administrador. Los participantes históricos necesitan además autorización individual y clave para el recorrido SíseVe.

Se corrigió una inferencia del catálogo: `prefijo_protegido` antes dependía de la existencia de documentos/correlativos. Para tipos restringidos ahora es siempre true por su reserva institucional; no cambia cuando aparece el primer documento. Se comprobó que la respuesta del catálogo fuera idéntica antes y después del registro de un caso QA.

Los catálogos físicos generales describen estantes y archivadores existentes, pero no revelan documentos asociados, asuntos, ubicación de un caso ni sus conteos. La asociación entre documento SíseVe y archivador solo se consulta tras ambas verificaciones y el permiso documental. El dashboard existente solo presenta el perfil; no se añadieron resúmenes de casos.

El historial restringido respeta el enmascaramiento ya definido en los triggers: actor, fecha, evento y campos modificados, sin valores anteriores/nuevos ni motivos confidenciales en texto claro. No se cambió este diseño ni se inventaron valores históricos que PostgreSQL no conserva.

## Circulación

Se mantienen PENDIENTE_DECISION, EN_TRASLADO, RECIBIDO, RECHAZADO y CANCELADO. La autorización de Dirección conserva PENDIENTE_DECISION y no genera movimiento. La salida consume la autorización y crea el movimiento dentro de una transacción. Recepción, rechazo, recuperación, cancelación y anulación utilizan exactamente los servicios y restricciones ya aprobados.

Cada intervención de cada participante requiere su propio permiso individual vigente y la clave compartida. Por tanto, Dirección y los destinatarios necesitan estar autorizados individualmente para ejecutar sus pasos. La autorización de contenido no cambia quién puede confirmar una recepción ni permite modificar movimientos cerrados.

## Pruebas y resultados

- Backend: typecheck, ESLint, build y npm test; 27 resultados aprobados, incluyendo contratos y aislamiento del contexto entre tareas concurrentes.
- Frontend: typecheck, ESLint, Vite y npm test; 40 resultados aprobados, incluyendo transmisión en body, claves literales independientes, rechazo de respuestas incompatibles y contratos administrativos.
- Integración `npm run test:siseve`: 35 resultados aprobados contando el grupo principal; incluye SQL/HTTP reales de SíseVe, Documentos, Movimientos, concurrencia y confidencialidad.
- Suites anteriores dentro de QA, con ROLLBACK: administración 14, tipos/ubicaciones 14 y consultas documentales 5 resultados aprobados.
- Se verificaron concesión/revocación, clave incorrecta/ausente, rotación y contraseña anterior, ausencia de privilegio automático del Administrador, registro/código, corrección, ubicación, decisiones, salidas, recepción, rechazo, recuperación, cancelación y anulación.
- Se verificó 429 para una cuenta y acceso correcto de otra desde la misma IP.
- Navegador contra React/Express/PostgreSQL QA: login de responsable y Administrador, rechazo con clave incorrecta, registro, corrección e historial con clave nueva por operación, campo de clave vacío después de enviar, listado/búsqueda y acceso directo denegado al Administrador sin autorización individual.
- Se inspeccionó la página administrativa con sus datos reales de QA. La concesión/revocación y rotación se comprobaron mediante HTTP real y contratos del cliente; no se efectuó la configuración de una contraseña institucional mediante el navegador.
- Emulación móvil: se midieron 390 px de viewport y 375 px de contenido en la vista del responsable, sin desbordamiento horizontal de página (tablas con desplazamiento interno); también se capturó la denegación administrativa en 390 px. No se probó en un teléfono físico.

La QA utiliza una base efímera con solo esquema/catálogos y cuentas de prueba aisladas; no copia datos personales. Se compara la estructura y huellas institucionales antes/después. Los COMMIT de prueba se realizan solo en QA; las suites heredadas usan además ROLLBACK. Las bases QA quedaron eliminadas. No se dejaron usuarios, claves o autorizaciones de prueba en la institución.

Comando reproducible desde backend, PowerShell:

```powershell
$env:VALIDAR_FLUJO_DOCUMENTAL='ROLLBACK_Y_QA_AISLADA'
npm run test:siseve
```

Evidencia: RESULTADOS_SISEVE.json, RESULTADOS_INTEGRACION_DOCUMENTAL.json y VERIFICACION_FINAL_SISEVE.json. Capturas: evidencias/siseve-escritorio-qa.png, evidencias/siseve-movil-qa.png y evidencias/siseve-admin-sin-acceso-qa.png, exclusivamente con datos de prueba.

## Puesta en uso institucional

El módulo está implementado y verificado en QA. La base real conserva su cuenta existente, sin documentos de prueba. Se aplicó únicamente el prefijo aprobado y su auditoría.

La contraseña compartida institucional y las autorizaciones individuales siguen sin configurar en la base real: no se inventó una contraseña ni se concedieron permisos a personas sin indicación. El Administrador debe entrar en `/siseve/administracion`, configurar privadamente la contraseña y seleccionar a los responsables autorizados, incluida Dirección cuando corresponda. No deben enviarse contraseñas por el chat ni incorporarse al código/documentación.

No quedan decisiones de diseño pendientes. La configuración inicial anterior es una tarea operativa institucional y no un mecanismo simulado. No se implementaron otros módulos ni se alteró el flujo de cinco estados.
