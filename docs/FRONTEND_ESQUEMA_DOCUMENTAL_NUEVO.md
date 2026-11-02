# Frontend conectado al esquema documental nuevo

Adaptación local del 1 de noviembre de 2026. Continúa sobre el backend descrito en
`BACKEND_ESQUEMA_DOCUMENTAL_NUEVO.md` y la base instalada en `database/README.md`.
No se ejecutó el instalador, no hubo migraciones adicionales ni creación de cuentas.

## Contratos y navegación activa

`frontend/src/api/documental.ts` valida con Zod las respuestas reales y centraliza
el transporte autenticado existente. Los bigint, IDs de cuenta, ámbito, documento,
tipo y unidad y las revisiones documentales se conservan como texto. El catálogo
fijo de roles mantiene su smallint numérico porque así lo exige el backend.
Una respuesta incompatible produce un error; no se convierte en un listado vacío.

| Pantalla | Ruta frontend | Contratos HTTP utilizados |
|---|---|---|
| Inicio | `/dashboard` | `GET /api/dashboard` |
| Documentos | `/documentos` | `GET /api/documentos` con búsqueda, clasificación, situación y paginación |
| Registro recibido/emitido | `/documentos/nuevo?clasificacion=RECIBIDO` o `EMITIDO` | `GET /api/documentos/opciones`, `POST /api/documentos` |
| Documento relacionado | `/documentos/nuevo?origen=ID` | Opciones y detalle autorizado del origen; alta con `origen_id` |
| Detalle e historia | `/documentos/:id` | `GET /api/documentos/:id`, `GET /api/documentos/:id/historial` |
| Corrección | `/documentos/:id/editar` | Detalle y opciones; `PUT /api/documentos/:id` con revisión y motivo |
| Acciones del detalle | Misma pantalla | `POST /api/documentos/:id/delegar`, `/ubicacion`, `/anular` |
| PDF | Detalle y registro | `GET /api/documentos/:id/pdf`, `POST .../pdf/cargas`, `/confirmar`, `/abrir`, `/eliminar` |
| Tipos propios o compartidos | `/tipos-documentales` | `GET/POST /api/tipos-documentales` |
| Ubicaciones propias o por cuenta | `/ubicaciones` | `GET/POST /api/ubicaciones`, `PUT /api/ubicaciones/:id` |
| Cuentas y asignación | `/usuarios`, `/usuarios/nuevo`, `/usuarios/:id`, `/usuarios/:id/editar` | `GET/POST /api/usuarios`, `GET/PUT /api/usuarios/:id`, `POST /api/usuarios/:id/clave` |
| Roles fijos | `/roles` | `GET /api/roles` |
| Oficinas | `/oficinas` | `GET/POST /api/oficinas`, `PUT /api/oficinas/:id` |
| Campos opcionales | `/campos-opcionales?usuario=ID` | `GET/POST /api/campos-opcionales`, `PUT /api/campos-opcionales/:id` |

Autenticación conserva `/api/auth/login` y `/api/auth/me`, revalidación, vencimiento
y descarte de resultados al cambiar la sesión. El perfil incorpora oficina y ámbito.
El frontend local usa `/api` y el proxy de Vite hacia `127.0.0.1:3000`; no se añadió
una URL productiva ni credencial a la compilación.

## Comportamiento implementado

- Superadministrador: administración, consulta documental global y filtro explícito
  de anulados. Administrador: administración sin enlaces ni pantallas documentales.
- Dirección y Secretaría: registro recibido/emitido, catálogo compartido y consulta
  institucional. Usuario: registro recibido/emitido, catálogo y ámbito personales.
  Los totales se reciben del dashboard SQL; React no descarga todo para calcularlos.
- Los controles de corregir, anular, delegar, ubicar y relacionar usan los booleanos
  del detalle. El PDF usa `modificar` de su propio endpoint. Los menús por rol son
  presentación; no sustituyen la autorización del servidor.
- El alta de Secretaría ofrece pendiente de Dirección por defecto o conservar en
  Mesa de Partes. Dirección ve guardar/delegar cuando el backend lo autoriza;
  Secretaría ve delegar sobre su documento conservado. Se envía la revisión vigente.
- La delegación exige persona registrada o nombre manual. Oficina es opcional;
  filtra personas compatibles y no ofrece oficinas sin destinatarios. Modo manual
  no envía oficina ni cuenta. El texto explica que no transfiere registro ni acceso.
- Cada cuenta con oficina administra unidades de clase libre, con contenedora
  opcional. La selección muestra la ruta completa y excluye la propia unidad y sus
  descendientes como padres. Administración puede elegir otra cuenta. Una cuenta
  sin oficina no tiene controles de ubicación.
- Administración añade y renombra campos por Usuario, sin acción de eliminación.
  El detalle, la corrección y el historial muestran la etiqueta histórica guardada.
- Corrección y anulación requieren motivo; los errores de revisión y autorización
  del servidor se propagan. La anulación conserva el registro y vuelve al listado.
- Los relacionados se abren mediante su detalle autorizado. El alta toma el ID de
  origen, conserva la identidad independiente y solo se ofrece con `relacionar`.
- PDF: sin adjunto, solo se ofrece subir a quien puede modificar; con adjunto, nombre
  y visualizar. PDF.js y su worker se cargan localmente al abrir el visor interno.
  Dentro del visor aparecen descargar y, si corresponde, reemplazar y eliminar.
  Seleccionar muestra previsualización y requiere confirmar subida. Eliminar tiene
  confirmación. La interfaz distingue limpieza pendiente de eliminación completada.
  Si un PDF falla tras registrar, muestra el documento ya creado sin repetir el alta.

Las rutas activas no incluyen SíseVe, movimientos físicos, recepción, aceptación ni
confirmación de entrega. El layout ya no monta el proveedor de claves antiguo.
Se conservaron fuentes y pruebas históricas no montadas para no borrar trabajo ajeno.
El grafo de compilación verifica que SíseVe y movimientos no forman parte del build.

## Ajustes mínimos del backend al conectar la interfaz

- `tipo_id` se serializa explícitamente como texto en listado y detalle.
- Listado y detalle incorporan `registrado_por_nombre` para distinguir registros de
  distintos ámbitos cuyos códigos visibles pueden coincidir.
- El detalle expone `permisos.relacionar`, conforme al ámbito y estado vigentes; evita
  que la interfaz deduzca esa capacidad. No se añadió transferencia ni acceso nuevo.

No hubo cambio de esquema ni de datos en esta adaptación del frontend.

## Verificación ejecutada

- Frontend: typecheck, lint sin advertencias, build y **48 pruebas aprobadas** en
  la suite activa de contratos, sesión, rutas, PDF y documental.
- Pruebas nuevas: bigint sin pérdida, contratos estrictos, navegación de cinco
  perfiles, rutas de unidades y ciclos, destinatario obligatorio y modo manual,
  verbos y revisiones del API, etiquetas históricas y controles PDF renderizados.
- Transporte PDF simulado: formato/tamaño, confirmación, revisión, fallos PUT,
  contexto vencido, lectura sin credenciales y rechazo del circuito retirado.
- Build: mantiene pantallas por carga diferida, entrada menor de 500 kB y visor
  PDF separado. Las pruebas históricas que exigen endpoints retirados no integran
  `npm test`; no se presentan como pruebas del flujo nuevo.
- Backend: tipos, lint y suite vigente con PostgreSQL local, permisos puros, acceso
  SQL, bloqueo concurrente, rutas sin autenticar y almacenamiento R2 simulado.
- Consulta real de solo lectura: base nueva OID 98367, `public`, `::1:5432`; cero
  cuentas y cero documentos. Las huellas de 22 tablas y 13 secuencias de la base
  anterior coinciden con el registro previo.

Los fixtures de las pruebas son objetos en memoria. No se insertaron en PostgreSQL,
no se crearon cuentas, contraseñas, bootstrap, bases QA ni objetos R2 de prueba.

## Pendiente: recorridos autenticados cuando existan las cuentas manuales

Las instrucciones de creación manual están en `database/CUENTAS_MANUALES.md`.
No es necesario compartir contraseñas en el chat. En cuanto el propietario confirme
las cuentas, deben verificarse por API y navegador estos recorridos:

1. Cinco roles: login, navegación, dashboard y rechazo de rutas ajenas. Administrador
   no consulta documentos ni PDF; Superadministrador filtra y abre anulados.
2. Usuario: catálogo personal, recibidos/emitidos, campos configurados, unidades
   independientes/anidadas y ausencia de ubicación sin oficina; separación de ámbitos
   aunque dos cuentas compartan oficina o un código documental coincida.
3. Secretaría: alta pendiente o conservada; Dirección guarda/delega la pendiente;
   Secretaría delega la conservada. Ninguna delegación aparece en la cuenta indicada.
4. Usuario delegado: conserva lectura/descarga de su registro, pierde las acciones
   prohibidas; Dirección/Secretaría consultan personales ajenos sin poder modificarlos.
   En el ámbito compartido ambas mantienen PDF después de delegar.
5. Corrección y anulación con motivo, actor e historia; etiquetas antiguas tras
   renombrado; relacionados con permiso aplicado en cada acceso.
6. PDF real aislado: registro sin/con PDF, adjunto posterior, previsualización y
   confirmación, visor, descarga vigente, reemplazo, eliminación física y recuperación
   de limpieza. Revalidar permisos también con solicitudes directas.
7. Pantallas antiguas abiertas y solicitudes concurrentes: revisión obsoleta debe
   rechazarse, sin perder identidad, historial, relaciones ni PDF vigente.

Estos recorridos todavía no están acreditados por las pruebas sin cuentas.
Tampoco se ha comprobado visualmente el flujo autenticado ni la descarga contra R2
real en el esquema nuevo. No se hizo commit, push, despliegue ni cambio productivo.

## Inicio local

En una terminal dentro de `backend`: `npm run dev`.
En otra dentro de `frontend`: `npm run dev`.
Abrir `http://localhost:5173/login`. No ejecutar el SQL de instalación ni las
migraciones antiguas para iniciar la aplicación.
