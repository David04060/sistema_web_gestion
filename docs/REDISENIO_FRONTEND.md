# Rediseño visual del Sistema Web Documental

Fecha: 22 de octubre de 2026.

## Alcance

Rediseño de presentación de los diez módulos existentes: Login, Dashboard, Documentos, Movimientos, Tipos documentales, Ubicaciones, SíseVe, Roles, Oficinas y Usuarios. No se añadieron funcionalidades documentales, estados ni métricas; no se modificaron endpoints, servicios backend, contratos, autenticación o reglas de permiso. El único cambio bajo backend/tests amplía las verificaciones del layout.

No había capturas externas proporcionadas por el usuario. Tras su aclaración, se buscaron imágenes de otros sistemas y se consultaron referencias web; las capturas del proyecto sirvieron como comparación del estado anterior.

## Referencias visuales y criterios

- [Document Home, Prakash Ghodke / Never Before Seen](https://dribbble.com/shots/22395153-Document-Home): organización documental con navegación lateral, acciones de página y tabla como elemento central.
- [File manager, Untitled UI](https://dribbble.com/shots/25583251-File-manager-Untitled-UI): superficies neutras, jerarquía tipográfica y estructura sobria de navegación/contenido.
- [Paperless-ngx](https://docs.paperless-ngx.com/): referencia de un gestor documental real y agrupación de la navegación.
- [Atlassian, Navigation system layout](https://atlassian.design/components/navigation-system/layout): separación entre navegación lateral, topbar y contenido.
- [Carbon, Data table](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines): legibilidad de filas, cabeceras y relación entre tabla, filtros y acciones.

Las referencias orientaron estructura, espaciado y jerarquía. No se importaron sus plantillas, componentes, bibliotecas ni activos. No se reprodujeron gráficos, porcentajes o funcionalidades ajenas al sistema.

## Sistema visual

| Token | Valor |
| --- | --- |
| Principal | `#1F5E59` |
| Principal hover/activo | `#174945` |
| Fondo | `#F6F8FB` |
| Tarjetas | `#FFFFFF` |
| Superficie secundaria | `#EEF2F2` |
| Borde | `#D7E0E0` |
| Texto principal | `#1F2937` |
| Texto secundario | `#6B7280` |
| Éxito | `#2E7D32` |
| Advertencia | `#B7791F` |
| Error | `#C0392B` |
| Información | `#2563EB` |

Los estados usan superficies claras y variantes oscuras de texto para sostener el contraste. Siempre incluyen su nombre; el color no es su única señal. La navegación activa también usa borde, peso tipográfico y `aria-current`.

Los tokens se centralizan en `frontend/src/index.css`: paleta, radios de 12 px para superficies y 8 px para controles, sombra discreta y escala de espaciado de 4/8/12/16/24/32 px. Se conserva la fuente del sistema y no se descargan tipografías. El foco de teclado es visible y se respeta `prefers-reduced-motion`.

## Cambios visuales

### Layout

Sidebar blanca de 248 px en escritorio, agrupada en Espacio de trabajo y Administración. Los elementos siguen utilizando exactamente las condiciones de acceso anteriores. Se conserva el acceso condicionado a SíseVe y la separación del Administrador.

Topbar con contexto de la sección, identificación de la cuenta y cierre de sesión existente. El contenido utiliza una anchura máxima compartida y márgenes coherentes. Se añadió un enlace para saltar al contenido.

Hasta 800 px se utiliza un botón de menú que abre un `dialog` nativo: foco contenido, cierre con Escape, botón de cierre y cierre al navegar. Al pasar a escritorio se cierra el modal para evitar dejar el resto de la página inerte. El fondo no se desplaza con un diálogo abierto.

### Login

Tarjeta de acceso dividida en dos áreas en escritorio: identidad institucional a la izquierda y formulario a la derecha. Ilustración decorativa de documentos realizada con CSS, sin activos remotos ni datos simulados. En móvil se apilan las áreas y se elimina la decoración para priorizar el acceso. Se conservaron todos los campos, mensajes, validaciones y comportamientos del login.

### Dashboard

Tarjetas de resumen con jerarquía entre etiqueta y cifra, iconografía lineal y mayor separación. Accesos rápidos como acciones individuales. Resúmenes y listas en dos columnas en escritorio y una columna en móvil; indicadores en cuadrícula adaptable. Se mantuvieron las mismas consultas y diferencias entre perfiles: no se inventaron actividades ni métricas para llenar espacios.

### Tablas, filtros y formularios

Cabeceras suaves, filas más legibles, hover discreto, bordes y contenedores consistentes, paginación separada y desplazamiento horizontal limitado al contenedor de la tabla cuando corresponde. Se mantienen todas las columnas y acciones.

Los filtros y formularios utilizan los mismos controles, radios, alturas y espaciado. Los textarea comparten ahora el tratamiento de inputs/selects. Se diferencian acciones principales, secundarias y de riesgo, incluidos estados hover, focus y disabled. Los estados vacíos usan superficies y bordes discretos.

### Estados, mensajes e historial

Nuevo `EstadoBadge` reutilizable para los cinco estados existentes, con etiqueta legible y tono semántico. No cambia el valor enviado a Express ni añade estados. Aplicado en Documentos, Movimientos, SíseVe y actividad del Dashboard.

Se unificaron mensajes de carga, error, advertencia, éxito y los diálogos de confirmación. El historial usa una línea temporal sencilla que conserva los mismos actores, fechas y valores. Las pantallas 404 y de acceso denegado comparten la nueva identidad.

## Archivos de aplicación modificados o añadidos

Nuevos:

- `frontend/src/components/icons/Icono.tsx`.
- `frontend/src/components/ui/EstadoBadge.tsx`.
- `frontend/src/components/ui/EstadoBadge.module.css`.

Modificados:

- `frontend/src/index.css`.
- `frontend/src/components/layout/AdminLayout.tsx`.
- `frontend/src/components/layout/AdminLayout.module.css`.
- `frontend/src/components/ui/Admin.module.css`.
- `frontend/src/components/ui/EstadoCarga.tsx`.
- `frontend/src/components/ui/EstadoPagina.module.css`.
- `frontend/src/components/ui/Confirmacion.module.css`.
- `frontend/src/features/auth/styles/Login.module.css`.
- `frontend/src/features/dashboard/pages/DashboardPage.tsx`.
- `frontend/src/features/dashboard/styles/Dashboard.module.css`.
- `frontend/src/features/documentos/pages/DocumentosListaPage.tsx`.
- `frontend/src/features/documentos/pages/DocumentoDetallePage.tsx`.
- `frontend/src/features/documentos/styles/Documentos.module.css`.
- `frontend/src/features/movimientos/pages/MovimientosPages.tsx`.
- `frontend/src/features/siseve/components/SiseveResultado.tsx`.
- `frontend/src/features/siseve/styles/Siseve.module.css`.

Roles, Oficinas, Usuarios, Tipos y Ubicaciones reciben el rediseño mediante su layout y componentes/estilos compartidos; no fue necesario duplicar hojas por pantalla ni cambiar sus formularios funcionales.

Verificación y entrega:

- `backend/tests/revision-final.browser.mjs`: controles del menú activo, sidebar móvil, Escape, retorno del foco, navegación y cierre al cambiar a escritorio.
- `docs/REDISENIO_FRONTEND.md`: este informe.
- `docs/RESULTADOS_REDISENIO.json`: resumen de la verificación del rediseño.
- `docs/evidencias-redisenio/`: capturas de QA seleccionadas.
- Los verificadores existentes regeneran sus JSON y capturas de revisión/Dashboard.

## Verificaciones

- TypeScript, ESLint y build frontend: aprobados.
- Pruebas frontend: 40 aprobadas.
- Regresiones backend: 27 aprobadas.
- Revisión integral HTTP/PostgreSQL/Chrome: 12 pruebas aprobadas, incluyendo su prueba principal.
- Matriz de 37 pantallas/rutas a 1440 y 390 px: 74 comprobaciones de viewport, sin desbordamiento horizontal de la página.
- Formularios reales de roles, oficinas, usuarios, tipos, estantes, archivadores y documentos; confirmaciones, filtros y rutas restringidas: aprobados.
- Circuito documental real en navegador con los perfiles correspondientes: aprobado.
- Sidebar de escritorio activa, apertura del menú móvil, selección de destino, cierre, Escape, retorno del foco y transición a escritorio: aprobados.
- Dashboard con cuatro perfiles a 1440/390 px: accesos rápidos, carga, error HTTP 500 sin detalle interno y reintento: aprobados.
- Inspección visual de capturas de login, Dashboard, Documentos, formularios y menú móvil.

Las pruebas de escritura utilizaron bases QA efímeras. Los verificadores comprobaron su eliminación y la conservación de estructura y datos institucionales. No se escribieron fixtures en la aplicación real ni se configuró una clave institucional SíseVe.

La compilación final genera un chunk principal de aproximadamente 504 kB (147,71 kB gzip). Vite informa su advertencia de tamaño superior a 500 kB; el build termina correctamente. No se cambió la carga de rutas ni se elevó el umbral para ocultarla, manteniendo esta tarea en el ámbito visual.

Las pruebas de accesibilidad son básicas y no constituyen una certificación WCAG ni pruebas con todos los lectores de pantalla. La inspección visual y la matriz de Chrome complementan las regresiones; no sustituyen la aceptación del personal institucional.

## Evidencias

Todas las cifras, cuentas y documentos visibles en las capturas pertenecen a QA; no representan datos institucionales reales.

- `evidencias-redisenio/dashboard-escritorio.png`.
- `evidencias-redisenio/dashboard-movil.png`.
- `evidencias-redisenio/documentos-escritorio.png`.
- `evidencias-redisenio/login-escritorio.png`.
- `evidencias-redisenio/login-movil.png`.
- `evidencias-redisenio/sidebar-movil.png`.
- `evidencias-redisenio/usuarios-movil.png`.

No se añadieron dependencias, funcionalidades de negocio ni gráficos. No se publicó el sistema ni se realizaron commit/push.
