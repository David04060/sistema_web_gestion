# Dashboard documental

Implementación y validación del 22 de octubre de 2026.

## Alcance y comportamiento

El panel usa `GET /api/dashboard` con JWT Bearer y `Cache-Control: no-store`. No admite identidad ni permisos del cliente. El middleware autentica; el servicio vuelve a consultar la cuenta y su rol vigente en PostgreSQL. No se añadieron tablas, columnas, estados, migraciones ni dependencias de aplicación.

Se conservan las capas Routes → Controllers → Services → Repositories → PostgreSQL. La consulta del panel se ejecuta en una transacción `REPEATABLE READ READ ONLY`: permisos, oficinas y contadores pertenecen a una misma instantánea. No hay agregación de documentos en React.

| Perfil | Contenido |
| --- | --- |
| Administrador | Total de usuarios, activos, inactivos, oficinas, roles y tipos documentales; accesos a los cuatro catálogos. Las listas y estadísticas documentales se devuelven vacías. |
| Director(a) | Documentos ordinarios institucionales, distribución por los cinco estados, decisiones pendientes, autorizaciones que esperan salida, indicadores personales y actividad de documentos consultables. |
| Usuario | Documentos consultables por registro o responsabilidad; bajo su responsabilidad; registrados por él; documentos enviados; recepciones y recuperaciones propias; actividad autorizada. |
| Secretaría de Dirección o usuario de Mesa de Partes | Lo anterior dentro de sus permisos, más originales recibidos propios que requieren solicitar decisión; autorizaciones propias listas para salida física. |

Dirección conserva el alcance institucional que ya utiliza el repositorio de documentos. La acción de autorizar sigue exigiendo las comprobaciones vigentes del módulo documental, incluida la oficina Dirección. Mostrar un documento no concede permiso para modificarlo.

Los accesos rápidos permiten consultar documentos, revisar movimientos, registrar si existe oficina asignada y gestionar ubicaciones propias. SíseVe conserva su navegación y controles separados en el menú existente.

## Definiciones de indicadores y SQL

El SQL completo está en `backend/src/modules/dashboard/dashboard.repository.ts`.

Parámetros documentales: `$1` es la identidad autenticada, `$2` indica el rol Director(a) consultado en PostgreSQL y `$3` identifica el circuito de Mesa de Partes según rol/oficina vigente. Las entradas del cliente nunca se interpolan en SQL.

La CTE `contenido` reutiliza `contenidoAutorizadoSQL()` y la CTE `recorrido` reutiliza `recorridoAutorizadoSQL()`. Ambas añaden obligatoriamente:

```sql
NOT td.requiere_clave AND lower(btrim(td.nombre)) <> 'síseve'
```

La comprobación explícita impide que un contexto restringido habilite información SíseVe en el Dashboard. Un participante histórico solo aporta metadatos del recorrido; no obtiene asunto, remitente, observaciones ni ubicación del contenido.

| Indicador | Cálculo y alcance |
| --- | --- |
| Usuarios | `count(*)` de usuarios, solo Administrador. |
| Activos / inactivos | `count(*) WHERE activo` / `WHERE NOT activo`, solo Administrador. |
| Oficinas / roles / tipos | Conteo de sus catálogos administrativos; tipos incluye el catálogo autorizado al Administrador, no el número ni el contenido de expedientes restringidos. |
| Documentos ordinarios consultables | `count(*)` de `contenido`, activos y anulados. |
| Bajo mi responsabilidad | `count(*)` de `contenido WHERE activo AND responsable_actual_id=$1`. Incluye custodia conservada durante traslados y recuperaciones. |
| Registrados por mí consultables | `count(*)` de `contenido WHERE registrado_por_id=$1`. |
| Documentos enviados por mí | `count(DISTINCT documento_id)` de `recorrido WHERE usuario_origen_id=$1`; cuenta documentos únicos, no eventos de envío. |
| Por estado | Conteo sobre `contenido` para cada uno de los cinco estados aprobados; incluye anulados. |
| Pendientes de decisión | Documentos activos `PENDIENTE_DECISION` con `destinatario_autorizado_id IS NULL`. |
| Autorizados esperando salida | Documentos activos `PENDIENTE_DECISION` con `destinatario_autorizado_id IS NOT NULL`. No constituye otro estado. |
| Recepciones pendientes | Movimientos ordinarios `EN_TRASLADO` cuyo destinatario es `$1`. |
| Recuperaciones pendientes | Movimientos ordinarios `RECHAZADO` cuyo origen es `$1` y sin confirmación de devolución. |
| Recibidos para solicitar decisión | Documentos propios activos `RECIBIDO`, solo circuito de Mesa de Partes. |

Los estados son exclusivamente `PENDIENTE_DECISION`, `EN_TRASLADO`, `RECIBIDO`, `RECHAZADO` y `CANCELADO`. Los contadores de decisión/salida son subconjuntos de los documentos consultables; no equivalen en todos los perfiles a acciones que el usuario puede realizar.

`pendientes` devuelve hasta ocho intervenciones concretas: decisiones para Dirección, salidas autorizadas para el custodio, recepciones para el destinatario, recuperaciones para el remitente y solicitudes de decisión para Mesa de Partes. Los enlaces abren los detalles existentes y sus controles de autorización. Se ordenan por modificación descendente con desempate estable.

`recientes` devuelve hasta ocho documentos con contenido consultable, ordenados por última modificación. Representa la modificación más reciente de cada documento; no pretende reconstruir todos los eventos del historial. Se serializan únicamente identidad, código, estado, fecha y ruta. No se ejecutan búsquedas generales ni consultas SíseVe desde este módulo.

## Interfaz

Se reutilizaron `apiRequest`, `useConsulta`, `useAuth`, React Router y las variables visuales institucionales. El contrato se valida con Zod. Se incorporaron tarjetas, resumen por estados, operaciones, actividad, accesos, mensajes vacíos, carga accesible, errores públicos y reintento.

El panel se vuelve a consultar al entrar en la ruta, recuperar el foco, volver a una pestaña visible o pulsar Actualizar panel. No hay actualización por WebSocket ni sondeo periódico; al regresar después de una acción documental se obtiene una nueva instantánea. `useConsulta` descarta respuestas antiguas al desmontar o cambiar de sesión.

Diseño con CSS Modules, cuadrícula adaptable y utilidades existentes. Sin bibliotecas adicionales de gráficos. Las listas y contadores tienen etiquetas que explican su alcance.

## Archivos

Nuevos:

- `backend/src/modules/dashboard/dashboard.routes.ts`
- `backend/src/modules/dashboard/dashboard.controller.ts`
- `backend/src/modules/dashboard/dashboard.service.ts`
- `backend/src/modules/dashboard/dashboard.repository.ts`
- `backend/src/modules/dashboard/dashboard.types.ts`
- `backend/tests/dashboard.integration.mjs`
- `backend/tests/dashboard.browser.mjs`
- `frontend/src/features/dashboard/api/dashboard.api.ts`
- `frontend/src/features/dashboard/schemas/dashboard.schema.ts`
- `docs/DASHBOARD.md`

Modificados:

- `backend/src/app.ts`: montaje del endpoint autenticado.
- `backend/package.json`: comando `test:dashboard`.
- `frontend/src/features/dashboard/pages/DashboardPage.tsx`.
- `frontend/src/features/dashboard/styles/Dashboard.module.css`.

La suite integral existente también regenera `docs/RESULTADOS_INTEGRACION_DOCUMENTAL.json` y `docs/RESULTADOS_SISEVE.json`; la fecha interna de esos archivos procede de su verificador anterior. La fecha de la ejecución actual es la de este informe.

## Pruebas y reproducción

Desde `backend`:

```powershell
npm run typecheck
npm run lint
npm run build
npm test
npm run test:dashboard
$env:QA_DASHBOARD_BROWSER='SI'
npm run test:dashboard
$env:VALIDAR_FLUJO_DOCUMENTAL='ROLLBACK_Y_QA_AISLADA'
node --test tests/flujo-migration.integration.mjs
```

Desde `frontend`: `npm run typecheck`, `npm run lint`, `npm run build` y `npm test`.

La prueba nueva exige el esquema aprobado ya existente antes de usar el preparador QA. Este copia únicamente el esquema y catálogos a una base temporal con nombre UUID; las cuentas y documentos de prueba se insertan exclusivamente allí. Al finalizar se elimina esa base, se comprueba su identidad y se comparan las huellas de estructura y datos institucionales. No se aplicó DDL en la base institucional.

La comprobación opcional de navegador usa Playwright del runtime local de Codex y Chrome instalado; no añade dependencias al proyecto. Ese import apunta al runtime de esta máquina. En otro equipo debe adaptarse la ruta del import a su instalación. Las capturas QA quedan en `backend/.private/dashboard/`, excluidas por `.gitignore`.

Resultados:

- TypeScript y ESLint de ambos proyectos: aprobados.
- Compilaciones de backend y frontend: aprobadas.
- Regresiones backend: 27 pruebas aprobadas.
- Regresiones frontend: 40 pruebas aprobadas.
- Suite integral documental: 35 pruebas aprobadas, incluyendo flujos HTTP, concurrencia y protección SíseVe. Además ejecuta 14 pruebas administrativas, 14 de catálogos y 5 de consultas en QA.
- Dashboard: 9 subcasos HTTP/SQL y su prueba principal; verifican JWT, vacío, administración, aislamiento, autorización, salida, rechazo, recuperación, recepción, SíseVe y cuenta inactiva.
- Navegador: Administrador, Dirección, Mesa de Partes y usuario; 1440 y 390 píxeles, sin desbordamiento horizontal; enlaces rápidos, carga, error 500 sin detalle privado y reintento.

## Problemas resueltos y límites

El sandbox inicial impidió procesos hijos con `spawn EPERM` en Vite y node:test. Se repitieron con ejecución permitida y finalizaron correctamente. El verificador visual se ajustó a las URL `file:///` de ESM en Windows y utilizó Chrome instalado porque los binarios predeterminados de Playwright y Edge no estaban disponibles.

No existe repositorio `.git` en este directorio; no se realizaron commit, push ni despliegue. El trabajo quedó local y dentro del alcance del Dashboard. Las pruebas visuales utilizan datos exclusivos de QA; el panel real consulta siempre PostgreSQL, sin fixtures de aplicación.
