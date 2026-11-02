# Historial, ubicaciones y administración: mejora local

Destino verificado: `sistema_web_documental_final`, OID 98367, host local `::1`,
esquema `public`. Se conservó el trabajo anterior del repositorio. No se recreó
ninguna base, no se crearon copias QA ni se hicieron commit, push o despliegue.

## Cambios funcionales y contratos

- El resumen de historial mantiene todos los eventos almacenados y muestra acción,
  actor y fecha. Registro inicial no muestra comparaciones; valores vacíos iguales
  se omiten de los cambios. No se modificó ni eliminó ningún evento.
- «Ver más detalles» carga `GET /api/documentos/:id/auditoria`. El backend primero
  comprueba lectura del documento. Devuelve eventos con actor, fecha, acción,
  motivo y pares de valores legibles; no devuelve snapshots JSON crudos en esta
  respuesta ni claves privadas. Los IDs de evento solo sirven como claves de React,
  no se presentan en pantalla. Incluye operaciones PDF de auditoría documental y
  los eventos de limpieza PDF pendientes/completados, evitando repetir carga,
  reemplazo y eliminación en ambas fuentes. Un evento sin actor almacenado no
  recibe un actor inventado. El PDF notifica sus cambios para recargar historia
  y auditoría abiertas.
- El listado conserva código enlazado, filtros y paginación; añade «Ver detalle»
  con exactamente la misma ruta y una columna de ubicación legible.
- Usuarios conserva el nombre enlazado al detalle y retira «Editar» del listado.
  En el detalle quedan «Editar cuenta y asignación» y «Volver» como navegación.
  La edición usa máximo dos columnas y una en móvil, sin checkbox de actividad.
- `PUT /api/usuarios/:id` ya no acepta `activo`; conserva la actividad existente.
  `POST /api/usuarios/:id/actividad` recibe únicamente `{activo,motivo}`. Bloquea
  la cuenta protegida para Administrador y su desactivación también desde
  Superadministrador. Cambia solo actividad, versión de sesión y marca de tiempo;
  audita actor, fecha, motivo y antes/después. La acción visible pide confirmación,
  bloquea envíos y recarga la cuenta al terminar. Contraseñas siguen en 8–128 y scrypt.
- Alta y edición validan rol/oficina en el backend y filtran la interfaz. Usuario
  admite oficina no institucional o ninguna; Dirección exige Dirección, Secretaría
  exige Mesa de Partes; cuentas administrativas siguen sin oficina documental.
- Administrador y Superadministrador configuran campos para roles 3, 4 y 5.
  Se conserva su propiedad por cuenta, el motivo de renombrado y los nombres
  históricos ya guardados en documentos. Configurar campos no concede lectura
  documental al Administrador.

## Ubicaciones: reutilización y conservación

No se necesitaron columnas nuevas. El esquema ya separa `clase` y `nombre`:

- «Crear lugar»: nombre libre, `clase='Lugar'`, `padre_id=null`.
- «Agregar contenido»: elemento físico en `clase`, identificador en `nombre` y
  lugar padre obligatorio. La selección es de unidades propias; las restricciones
  de PostgreSQL y la transacción conservan el control de propiedad y ciclos.
- El árbol agrupa raíces y contenido, mostrando identificador y elemento físico.
  Las selecciones documentales permiten tanto la raíz como el contenido.
- Para unidades anteriores se conservan clase, nombre y padre. Las raíces cuya
  clase era específica se presentan como «Clase: Nombre»; no se las reclasifica.
  Los descendientes muestran su identificador. Las jerarquías antiguas más
  profundas siguen mostrándose y mantienen su padre al editar.
- Las nuevas rutas documentales incluyen los nombres de raíz y contenido, por
  ejemplo «Estante A / Informes de marzo». Las rutas históricas almacenadas no
  se recalcularon ni reescribieron.

## PostgreSQL

Se aplicó solo `database/changes/003-oficinas-y-rutas-local.sql`:

1. `validar_usuario_oficina()` impide también en SQL asignar a Usuario las oficinas
   institucionales reservadas. Conserva las validaciones previas de los otros roles.
2. `validar_ubicacion()` genera la ruta legible al registrar una ubicación nueva,
   manteniendo permisos, propiedad, estado y la auditoría existente.

El primer envío se revirtió por un separador SQL; se corrigió y confirmó la
transacción completa. Las huellas de las 21 tablas coincidieron antes/después.
No se modificaron datos existentes ni se desactivaron triggers. El instalador y
los archivos de documentación de funciones se actualizaron; no se ejecutó el
instalador ni se reaplicaron los incrementales anteriores.

## Verificación ejecutada y conservación

`npm run test:mejoras:local`, desde backend, ejecuta HTTP y PostgreSQL reales con
tokens efímeros locales, sin contraseñas en archivos. Sus fixtures incluyen cuenta
de prueba, oficina, campos, lugares, contenido y documentos. Todas las operaciones
se ejecutan en una transacción exterior, usando savepoints para las operaciones
del sistema, y se revierten íntegramente al terminar. No se simulan respuestas SQL.

Se comprobó:

- Alta/edición y SQL directo rechazan oficinas reservadas para Usuario; cambio de
  rol con oficina incompatible se rechaza.
- Activación/desactivación solo de la cuenta temporal, motivo obligatorio y dos
  eventos auditados; los demás datos permanecen iguales. Roles sin permiso y
  desactivación del Superadministrador se rechazan.
- Configuración y registro de campos desde Directora, Secretaría y Usuario.
- Lugar independiente, contenido propio, padre ajeno y ciclos; ubicación directa
  en la raíz y luego en contenido; ruta igual en listado, detalle e historia.
- Corrección con motivo, conservación de etiqueta histórica al renombrar y
  auditoría completa. Administrador y Usuario ajeno reciben 404 por API directa;
  Dirección conserva su consulta institucional.
- Comparación de todas las filas de las 21 tablas tras rollback: coinciden con
  la huella anterior. No persistieron cuentas ni datos de prueba de esta etapa.
  Las secuencias pueden presentar saltos normales por INSERT revertidos; no
  se reiniciaron ni se alteraron manualmente.

Pruebas frontend de render con respuestas en memoria verifican enlaces de código
y detalle, resumen sin comparaciones iniciales, acción de auditoría, edición en
dos columnas, navegación de cuenta, actividad separada, selector sin oficinas
reservadas, lugares agrupados y apertura de campos para los tres perfiles.
Estos renders no son recorridos de navegador.

También se comprobaron por el proxy real localhost:5173 los permisos de auditoría
del documento local 4 con los cinco roles, sin escribir en él.

## Pendiente visual comprobado

La herramienta de navegador falló antes de conectar con el error
`failed to write kernel assets: ... ruta especificada (os error 3)`.
No se reprodujeron las capturas ni se verificaron clics y tamaños de escritorio o
móvil visualmente. El CSS responsivo y los controles están implementados y se
verifican por tipos, render y compilación; no se declara una prueba visual aprobada.
No se probaron nuevas operaciones reales contra R2 en esta etapa.

## Archivos principales

- Backend: `documentos/auditoria.documental.ts`, `documentos.operaciones.ts`,
  `documentos.routes.ts`, `usuarios/administracion.operaciones.ts`,
  `administracion.routes.ts`, `shared/documental/nucleo.ts`.
- Frontend: API documental, historial, auditoría detallada, detalle/listado,
  componente PDF, ubicaciones, listado/detalle/formulario de usuarios, configuración
  de campos y estilos compartidos.
- Pruebas: `backend/tests/mejoras-local.test.mjs`, regresión de administración,
  `frontend/tests/detalle-documental.test.mjs` y contratos de rutas de ubicación.
- Esquema: incremental 003, SQL principal y documentación de funciones.

## Resultado final de controles

- Frontend: typecheck, lint y build aprobados; **53 pruebas aprobadas**.
- Backend: typecheck, lint y build aprobados; **30 pruebas** de la suite habitual.
- Suites locales de mejoras, administración y delegación: **19 pruebas aprobadas**
  en conjunto, de las cuales 7 pertenecen a las mejoras de esta etapa.
- `git diff --check` sin errores. No se incluyeron secretos ni artefactos privados.
- API real de auditoría del documento 4: roles 1/3/4 devuelven 200 con sus dos
  eventos; roles 2/5 devuelven 404 sin contenido documental.
- La revisión visual sigue pendiente por el fallo de la herramienta indicado arriba.

Inventario de fuentes y contratos modificados en esta etapa:

```text
backend/package.json
backend/src/shared/documental/nucleo.ts
backend/src/modules/documentos/auditoria.documental.ts
backend/src/modules/documentos/documentos.operaciones.ts
backend/src/modules/documentos/documentos.routes.ts
backend/src/modules/usuarios/administracion.operaciones.ts
backend/src/modules/usuarios/administracion.routes.ts
backend/tests/administracion-local.test.mjs
backend/tests/mejoras-local.test.mjs
frontend/src/api/documental.ts
frontend/src/lib/historialDocumental.ts
frontend/src/components/ui/Admin.module.css
frontend/src/features/documentos/components/HistorialDocumento.tsx
frontend/src/features/documentos/components/AuditoriaDocumento.tsx
frontend/src/features/documentos/components/ArchivoPdf.tsx
frontend/src/features/documentos/pages/DocumentoDetallePage.tsx
frontend/src/features/documentos/pages/DocumentosListaPage.tsx
frontend/src/features/ubicaciones/pages/UbicacionesPage.tsx
frontend/src/features/usuarios/pages/UsuariosListaPage.tsx
frontend/src/features/usuarios/pages/UsuarioDetallePage.tsx
frontend/src/features/usuarios/pages/UsuarioFormularioPage.tsx
frontend/src/features/usuarios/pages/ConfiguracionPages.tsx
frontend/tests/detalle-documental.test.mjs
frontend/tests/documental.test.mjs
database/changes/003-oficinas-y-rutas-local.sql
database/sistema_documental_instalacion.sql
database/schema/identidad.schema.sql
database/schema/documentos.schema.sql
database/README.md
docs/MEJORAS_HISTORIAL_UBICACIONES_CUENTAS_LOCAL.md
```
