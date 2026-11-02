> Informe histórico: las instrucciones de copias y QA de este documento fueron sustituidas.
> El entorno vigente usa sistema_web_final local. Consultar [DESARROLLO_LOCAL.md](DESARROLLO_LOCAL.md) y el README.

# Asignación y entrega de Secretaría — desarrollo, 27/10/2026

Sobre la versión recuperada y la clasificación RECIBIDO/EMITIDO existente.

## Representación

`entregas_secretaria` conserva una fila por documento ordinario de Secretaría:

- `PENDIENTE_ASIGNACION`: todavía sin destinatario.
- `PENDIENTE_ENTREGA`: Dirección asignó oficina, usuario o persona sin cuenta.
- `ENTREGADO`: la Secretaría autora confirmó la entrega física.

La clasificación, la autoría, la custodia, la ubicación y los estados históricos del documento permanecen independientes. El nuevo flujo no consulta el estado anterior para asignar o confirmar. Los movimientos antiguos se consultan como antecedentes; sus operaciones no se usan en registros incorporados al nuevo flujo. SíseVe conserva su circuito protegido separado.

## API

POST `/api/documentos/:id/asignar-destinatario`: `{tipo,oficina_id,usuario_id,nombre,revision}`. No admite motivo ni confirmaciones adicionales. Tipos: OFICINA, USUARIO, PERSONA. Los campos no utilizados se envían como null. Una persona manual no necesita oficina ni cuenta.

POST `/api/documentos/:id/confirmar-entrega`: `{revision}`. Solo Secretaría autora. No requiere actuación del destinatario. La fecha registrada indica cuándo se confirmó en el sistema.

GET `/api/documentos?situacion=PENDIENTE_ENTREGA`: filtro SQL previo a paginación y total. También admite PENDIENTE_ASIGNACION y ENTREGADO.

Las escrituras bloquean el documento y comprueban la revisión mostrada. Una asignación concurrente invalida la confirmación anterior; una entrega impide reasignaciones y dobles confirmaciones. Los triggers protegen la transición y la inmutabilidad de entregas confirmadas. Las asignaciones conservan nombres históricos y cada evento se agrega a `entregas_secretaria_historial`.

## Migración local

Desde backend: `node scripts/preparar-entrega-dev.mjs`.

Usa el manifiesto privado existente y valida base, OID, servidor local y ausencia de rama Neon. Aplica secuencialmente los tres SQL `20261027-entrega-secretaria-*-desarrollo.sql`. Los antecedentes de Secretaría se habilitan pendientes, sin inventar destinatarios, fechas de asignación ni entregas. El historial anterior no se reescribe.

La primera migración comparó y conservó exactamente las filas de 57 documentos. Las comprobaciones posteriores también compararon todas las filas existentes antes y después, incluidas las fixtures acumuladas en desarrollo.

## Verificación ejecutada

- Backend: `npm test`, 36/36.
- Frontend: `npm test`, 53/53, incluida carga diferida, clasificación y transporte SíseVe.
- Typecheck y lint de ambos proyectos: correctos.
- Frontend: `npm run build:clasificacion:dev`, correcto.
- Integración: `CLASIFICACION_DEV_AUTORIZADA=PROBAR_COPIA_RECUPERADA node --import tsx --test tests/clasificacion.integration.mjs`, 11/11 incluyendo grupo principal. 258 llamadas del helper HTTP más solicitudes concurrentes.
- Casos: recibido/emitido; oficina con/sin usuario; usuario; persona manual; coherencia; permisos directos; filtro; historial; asignación frente a confirmación concurrentes; doble confirmación simultánea; conservación anterior; privacidad y SíseVe.
- Navegador: sesiones QA reales de Dirección y Secretaría; asignación manual y confirmación; escritorio 1440x1000 y móvil 390x844. Detalle y listado sin desbordamiento horizontal de página. Evidencias en `docs/evidencias-entrega/`.

Los procesos Node/Vite requirieron ejecución permitida fuera del aislamiento que generaba spawn EPERM; las ejecuciones finales con aislamiento normal entre pruebas pasaron. No se añadieron dependencias, no se hizo commit, push ni despliegue. Todas las escrituras de pruebas se limitaron a la copia local verificada. Las fixtures permanecen exclusivamente en ella.

## Corrección posterior del arranque habitual — 27/10/2026

Las verificaciones de la sección anterior se hicieron en la copia con servidor de prueba o vista compilada en 3117. No demostraban el funcionamiento del arranque habitual Vite + backend en 5173/3000.

Se reprodujo `GET http://localhost:5173/api/documentos` con 500, y también el 500 directo en 3000. La configuración Vite apuntaba a localhost:3000. Una captura temporal dentro del manejador del backend real registró `42P01: no existe la relación «entregas_secretaria»`, junto con su conexión efectiva: `sistema_web_final`, servidor `::1/128`, puerto 5432, esquema public, rol postgres. Esa base tampoco tenía `documentos.clasificacion_registro` ni `entregas_secretaria_historial`. La instrumentación temporal fue retirada después del diagnóstico.

Se corrigió `backend/npm run dev` para reutilizar el lanzador de copia existente en modo API, puerto 3000. Se añadieron comprobaciones de puerto, esquema y contrato SQL. El pool valida cada conexión física antes de prestarla. La configuración Vite ahora fija 5173 con strictPort y proxy explícito a 127.0.0.1:3000. No se modificaron consultas ni reglas funcionales para resolver este error.

Entorno efectivo después: `sistema_web_final_qa_clasif_8c8e3c88c12e43d7b22fac55623bfb3b`, OID 95090, servidor PostgreSQL local `::1/128`, puerto 5432, esquema public, rol efectivo sistema_web_app. Se comprobaron las columnas, las dos relaciones nuevas, sus triggers activos y la función de confirmación histórica. No faltaba ninguna migración: no se ejecutó ninguna adicional.

Pruebas NUEVAS después de la corrección:

- Integración contra `CLASIFICACION_HTTP_BASE=http://localhost:5173`: 11/11, 258 solicitudes del helper más solicitudes concurrentes. Se usa el proxy y el backend persistente reales; no se abre un servidor de prueba para estas solicitudes.
- Listado, opciones y detalle, recibido/emitido, privacidad por perfiles, asignación de oficina/usuario/persona, confirmación, historial, concurrencia y SíseVe: correctos.
- Navegador en localhost:5173: login QA de Secretaría, listado con recibido/emitido y entregados; apertura del emitido INF2026152 y recarga completa, conservando destinatario, clasificación, asignación y confirmación.
- Guardas de identidad: OID incorrecto y nombre de base original rechazados por lectura, sin escrituras.
- Typecheck y lint de ambos proyectos: correctos.
- Comparación de solo lectura del origen con el manifiesto de recuperación: las 12 tablas y todas las secuencias coinciden. No se modificó el origen ni se conectó a producción.

Los comandos actuales para ambos servidores y la regresión por Vite están en el README. No se añadieron dependencias ni funcionalidades, no se hizo commit, push ni despliegue.
