# Rediseño de interfaz institucional — 2 de noviembre de 2026

## Resultado y límites de alcance

Rediseño aplicado sobre el frontend existente. Trabajo exclusivamente en C:/Users/David/Sistema_Web_Final, conservando los cambios locales previos. No se hicieron commit, push, despliegue, migraciones, copias de bases ni cambios de backend. No se instalaron paquetes. En los recorridos del navegador no se confirmaron altas, correcciones, delegaciones, anulaciones, cambios de cuentas/oficinas/campos ni cargas/reemplazos/borrados PDF. Se consultaron datos locales mediante el backend local existente, se descargó un PDF ya existente y se seleccionó un PDF ficticio para previsualización local. Las sesiones fueron iniciadas por el usuario, sin recopilar sus contraseñas.

La verificación de interfaz de los cinco roles está realizada con los alcances de la tabla siguiente. Esto NO equivale a una certificación exhaustiva de todas las operaciones de escritura. Las pendientes están enumeradas al final.

## Sistema persistente y búsquedas

- MASTER: design-system/paillardelle-documental/MASTER.md.
- Variaciones necesarias: pages/login.md y pages/documentos.md en esa misma carpeta. Administración y dashboards usan el MASTER sin duplicar variaciones por rol.
- Plan: docs/superpowers/plans/2026-11-02-rediseno-interfaz.md.
- Skill real: .agents/skills/ui-ux-pro-max/SKILL.md; script verificado: .agents/skills/ui-ux-pro-max/scripts/search.py. Se leyeron también quick-reference.md y pro-rules.md, distinguiendo reglas web de convenciones nativas.
- Primera búsqueda education document management dashboard descartada por tipografía infantil y patrón comercial. Búsqueda afinada government administrative dashboard: estilo Accessible & Ethical, alto contraste y navegación legible.
- Búsquedas complementarias: theme state persistence y form state preserve (--stack react), responsive table mobile, dark mode contrast, accessible authentication (--domain ux).
- React realmente instalado: 19.3.1. La base de recomendaciones declara 19.2.x; se aplicó orientación compatible sobre estado y suscripciones, contrastando preservación de estado con documentación oficial de React 19.3: https://react.dev/learn/preserving-and-resetting-state.
- No había MASTER al inicio. Se generó con --persist y --output-dir apuntando al proyecto, sin --force. Se conservó la recomendación generada y se añadieron las decisiones institucionales vigentes.

## Inventario activo inspeccionado

Las fuentes de verdad son frontend/src/routes/AppRoutes.tsx y frontend/src/lib/perfiles.ts. Se inspeccionaron las páginas y componentes importados por esas rutas, incluidos los lazy imports y estilos compartidos.

| Ruta / grupo | Componentes activos | Perfiles |
|---|---|---|
| /login | LoginPage | Sin sesión |
| /dashboard | DashboardPage | Los cinco |
| /documentos | DocumentosListaPage | Superadministrador, Dirección, Secretaría, Usuario |
| /documentos/nuevo y /documentos/:id/editar | DocumentoFormularioPage, PrevisualizacionRegistroPdf | Dirección, Secretaría, Usuario; capacidades backend para corregir |
| /documentos/:id | DocumentoDetallePage, ArchivoPdf, ControlesPdf, VisorPdf, DestinoDocumental, HistorialDocumento, AuditoriaDocumento | Lectura por perfil y ámbito; escritura por capacidades backend |
| /tipos-documentales | TiposActualesPage en ConfiguracionPages | Dirección, Secretaría, Usuario |
| /ubicaciones | UbicacionesPage | Administradores por cuenta; otros según oficina; sin oficina muestra ayuda |
| /usuarios, /usuarios/nuevo, /usuarios/:id, /usuarios/:id/editar | UsuariosListaPage, UsuarioFormularioPage, UsuarioDetallePage | Superadministrador y Administrador |
| /oficinas y sus vistas de alta/detalle/edición | OficinasPages del grupo usuarios | Superadministrador y Administrador |
| /roles, /campos-opcionales | RolesActualesPage, CamposActualesPage, CamposCuenta | Superadministrador y Administrador |
| Sesión, 404 y rechazos | AppRoutes, CargaRuta, ErrorRuta, EstadoCarga | Según contexto |

Los archivos antiguos de movimientos/SiSeVe y catálogos reemplazados que permanecen en disco no se reactivaron ni se añadieron al menú. No se alteraron rutas, permisos, contratos ni indicadores del backend.

## Decisiones visuales

Logo original localizado y examinado: frontend/src/assets/logo-institucion.jpg, 553 × 555, 34 392 bytes. Se usa completo en login y navegación, sin modificar el archivo original, sin filtros ni generación de un escudo sustituto. Los nuevos favicons de 16 y 32 px recortan solamente el margen exterior celeste para hacer legible el escudo completo, preservando proporción. Icono táctil de 180 px. Se retiró el favicon de Vite y se cambió el título a Gestión Documental · I.E. Enrique Paillardelle.

Paleta: azul institucional para acciones y enlaces, celeste en selecciones y amarillo en un acento discreto. Superficies neutras, sin fotografías genéricas, recursos externos ni animaciones decorativas. Segoe UI/Arial/system-ui local; base 16 px, texto de controles 16 px, texto administrativo 15 px, ayudas 12–14 px. Formularios de hasta dos columnas, tarjetas con 28 px internos/20 px móvil, botones de 44–50 px, bordes de 8–14 px.

Tema semántico en index.css: fondos, superficies, texto, bordes, foco, éxito, aviso, error y PDF. Preferencia inicial del sistema; elección manual Claro/Oscuro guardada en paillardelle-tema, sincronizable entre pestañas. Script local antes del render inicial. El tema cambia data-tema del elemento html; no cambia claves ni desmonta formularios/PDF. Papel del PDF conserva sus colores; controles y contenedor se adaptan.

Tablas en tarjetas a 900 px, conservando tipo, ubicación y acciones. Buscador documental con etiqueta y ejemplo. Resúmenes extensos con Leer más/Leer menos, sin perder el texto original. Detalle, observaciones, historial y auditoría íntegros y con saltos de línea. Confirmaciones con acciones concretas. Estados vacíos, carga, alertas, éxito, foco y movimiento reducido compartidos.

## Archivos intervenidos en esta sesión

La lista siguiente identifica cambios de este rediseño. El git diff total incluye además cambios anteriores del usuario; no debe atribuirse entero a esta sesión.

### Identidad, tema y estructura

- frontend/index.html
- frontend/public/favicon.svg — eliminado, antiguo recurso Vite
- frontend/public/favicon-16.png — nuevo
- frontend/public/favicon-32.png — nuevo
- frontend/public/icono-institucion.png — nuevo
- frontend/public/tema-inicial.js — nuevo
- frontend/src/index.css
- frontend/src/lib/tema.ts — nuevo
- frontend/src/components/ui/SelectorTema.tsx — nuevo
- frontend/src/components/ui/SelectorTema.module.css — nuevo
- frontend/src/components/layout/AdminLayout.tsx
- frontend/src/components/layout/AdminLayout.module.css
- frontend/src/hooks/useMenuMovil.ts — breakpoint coherente con navegación

### Pantallas y componentes

- frontend/src/features/auth/pages/LoginPage.tsx
- frontend/src/features/auth/styles/Login.module.css
- frontend/src/components/ui/Admin.module.css
- frontend/src/components/ui/Confirmacion.module.css
- frontend/src/components/ui/EstadoBadge.module.css
- frontend/src/components/ui/EstadoPagina.module.css
- frontend/src/components/ui/TextoExpandible.tsx — nuevo
- frontend/src/features/dashboard/pages/DashboardPage.tsx
- frontend/src/features/documentos/pages/DocumentosListaPage.tsx
- frontend/src/features/documentos/pages/DocumentoDetallePage.tsx
- frontend/src/features/documentos/pages/DocumentoFormularioPage.tsx
- frontend/src/features/documentos/components/ArchivoPdf.tsx
- frontend/src/features/documentos/components/ArchivoPdf.module.css
- frontend/src/features/documentos/components/AuditoriaDocumento.tsx
- frontend/src/features/usuarios/pages/UsuarioDetallePage.tsx
- frontend/src/features/usuarios/pages/UsuarioFormularioPage.tsx
- frontend/src/features/usuarios/pages/ConfiguracionPages.tsx

Ubicaciones, oficinas, roles, campos e historial heredan el nuevo sistema a través de las clases compartidas existentes. No fue necesario modificar sus contratos ni reconstruir sus componentes.

### Pruebas, diseño y evidencias

- frontend/package.json — incorpora la prueba de preferencia de tema al comando test; conserva cambios previos.
- frontend/tests/tema.test.mjs — prueba de política manual/sistema, valor corrupto y almacenamiento bloqueado.
- frontend/tests/fixtures/rediseno-local.pdf — PDF ficticio de dos páginas, generado localmente, nunca enviado.
- design-system/paillardelle-documental/MASTER.md
- design-system/paillardelle-documental/pages/login.md
- design-system/paillardelle-documental/pages/documentos.md
- docs/superpowers/plans/2026-11-02-rediseno-interfaz.md
- docs/REDISENO_INTERFAZ_LOCAL.md
- docs/qa-rediseno/*.jpg — capturas del navegador local.
- frontend/dist/ — resultado generado de compilación, sin publicación.

## Verificación en navegador local

Sesiones reales iniciadas por el usuario en http://localhost:5173. Se usó el navegador integrado; no se sustituyó por datos simulados para los recorridos. No se leyó ni cambió ninguna contraseña.

| Rol | Evidencia del recorrido |
|---|---|
| Superadministrador | Dashboard con cuentas/oficinas/estados del backend; usuarios y alta sin guardar; conservación del nombre de usuario escrito al cambiar tema; oficinas y edición sin guardar; roles; campos de cuenta; ubicaciones por cuenta; búsqueda vacía/limpiar; textos expandibles; listado móvil con todos sus campos; consulta de anulado; detalle, relacionados, historial y auditoría. PDF existente abierto durante cambio de tema; página 2 conservada después de otro cambio. |
| Administrador | Dashboard sin contenido documental; cuatro cuentas visibles; detalle/edición con asignación de oficina coherente; confirmación de desactivación cancelada; alta de cuenta sin guardar; oficinas/alta, roles, campos y ubicaciones; rechazo de /documentos. Tabla de cuatro cuentas convertida en tarjetas, con todas las acciones. |
| Dirección | Dashboard; registro/relacionados; asunto retenido entre temas; PDF ficticio seleccionado y previsualizado sin enviarlo; corrección de documento propio sin guardar; confirmación de anulación cancelada; catálogo compartido; árbol y formulario de contenido de ubicación. Drawer móvil cerrado por Escape y foco devuelto a Abrir navegación. |
| Secretaría | Dashboard; registro con destino Dirección/Mesa de Partes y aparición de ubicación; asunto, PDF y página 2 conservados entre temas y tamaños; selección retirada y registro cancelado; documentos sin PDF con capacidad de subir; historial, tipos compartidos y ubicaciones vacías. Un documento que antiguamente tuvo PDF actualmente no lo tenía: se registró el estado real y no se simuló un adjunto. |
| Usuario | Dashboard personal; cuatro documentos visibles, sin menú administrativo ni ubicaciones para cuenta sin oficina; detalle con asunto de 1823 caracteres íntegro; historial/auditoría; PDF existente abierto y descargado; confirmación de eliminación cancelada; reemplazo seleccionado/previsualizado y cancelado; delegación manual preparada y cancelada; registro personal sin ubicación y texto retenido al cambiar tema; tipos personales; acceso a documento ajeno rechazado por backend y /usuarios rechazado por ruta. |

Tamaños comprobados: escritorio 1440×1000, tableta 768×1024 y móvil 375×812; comprobación adicional 320×800. Ambos temas fueron usados en los cinco roles durante los recorridos. Se midió scrollWidth frente a clientWidth, distinguiendo el espacio de la barra vertical. Matriz explícita de 320/375/768/1440 con Claro y Oscuro en tipos documentales: sin desbordamiento de página. También se midieron listados, registro, PDF, detalle, configuración y errores durante los recorridos. No se ejecutó el producto cartesiano de cada URL × cada rol × cada tamaño × cada tema.

Persistencia observada tras recarga y entre las sesiones de los distintos roles. Preferencia inicial del sistema y almacenamiento inválido/bloqueado cubiertos por prueba automatizada de la política; no se cambió la configuración de apariencia del sistema operativo. Movimiento reducido está contemplado por CSS; no se forzó una preferencia del SO. Foco y Escape del drawer comprobados con teclado; no es una auditoría completa con lector de pantalla.

Favicon y logo: imágenes completas observadas en navegador; PNG 16/32 inspeccionado visualmente y recursos comprobados por HTTP local con 200 y tipos correctos. Título observado en metadatos del navegador. La interfaz integrada no expone la barra nativa de pestañas de Chrome/Edge: su apariencia exacta en esa barra sigue sin verificación directa.

### Contraste calculado sobre tokens

| Pareja | Claro | Oscuro |
|---|---:|---:|
| Texto / superficie | 14.90:1 | 13.69:1 |
| Texto secundario / superficie | 6.06:1 | 8.59:1 |
| Texto secundario / superficie secundaria | 5.38:1 | 7.22:1 |
| Texto de botón / primario | 7.29:1 | 9.03:1 |
| Enlace / superficie | 7.29:1 | 8.93:1 |
| Error / fondo de error | 6.18:1 | 7.95:1 |
| Éxito / fondo de éxito | 6.69:1 | 7.94:1 |
| Advertencia / fondo de advertencia | 6.47:1 | 8.60:1 |
| Borde de control / superficie | 3.40:1 | 5.14:1 |

Cálculo con luminancia sRGB, no una auditoría píxel a píxel de todas las composiciones.

## Controles automáticos

Ejecutados en frontend:

- npm test: 59 pruebas, 59 aprobadas, 0 fallidas. Incluye contratos, sesiones, rutas, permisos de presentación, configuración, detalles, PDF y política del tema.
- npm run typecheck: aprobado, salida 0.
- npm run lint: aprobado, salida 0 y sin advertencias.
- npm run build: aprobado, Vite 8.3.4, 173 módulos. No despliegue.

La primera ejecución encontró dos aserciones de presentación: acceso a auditoría y asunto íntegro del listado. Se resolvieron manteniendo el texto íntegro en el componente expandible y el nombre claro Ver más detalles de auditoría; no se relajaron ni eliminaron pruebas existentes.

El sandbox inicial bloqueó la creación de procesos Node (EPERM); se ejecutó la suite con la aprobación automática de procesos locales. No quedaron verificaciones bloqueadas por ello. Algunos selectores necesitaron esperar el contenido asíncrono o usar el rol semántico correcto; los recorridos se recuperaron. El selector de archivos tardó notablemente en una ocasión, pero la previsualización y su cancelación se verificaron. No se presenta ese retraso de herramienta como un fallo del servidor.

## Pendientes reales

1. No se confirmó escritura real de registros, correcciones, delegaciones, anulaciones, usuarios, oficinas, ubicaciones, tipos ni campos en estos recorridos. Se probaron pantalla, selección, validación y/o confirmación/cancelación según el caso. Los contratos y transportes se cubren con la suite, que no sustituye una prueba con base real.
2. No se ejecutó PUT/confirmación, reemplazo ni borrado real de PDF. Se comprobó lectura/descarga real y previsualización local, incluida apertura durante cambio de tema; esto no prueba una carga de red en curso. No se hicieron escrituras sobre almacenamiento remoto desde esta tarea.
3. No se cambió ninguna contraseña ni se crearon cuentas. La asignación de oficina del Usuario permanece como estaba; su rama de ubicación con oficina no se recorrió con ese rol.
4. No se volvió a ejecutar la matriz completa del backend, pruebas SQL de concurrencia ni huellas de tablas, porque no se modificó backend/base. Conservación se basa en no confirmar operaciones de escritura, no en una comparación SQL del estado.
5. Favicon en barra nativa Chrome/Edge, lector de pantalla completo, zoom extremo y preferencia de movimiento reducido forzada a nivel SO quedan sin prueba directa.

## Capturas

- qa-rediseno/login-claro.jpg
- qa-rediseno/login-oscuro.jpg
- qa-rediseno/dashboard-claro.jpg
- qa-rediseno/dashboard-oscuro.jpg
- qa-rediseno/documentos-movil-claro.jpg
