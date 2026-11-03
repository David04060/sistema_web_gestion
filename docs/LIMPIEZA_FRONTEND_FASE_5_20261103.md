# Limpieza del frontend activo y estilos — fase 5

Fecha: 3 de noviembre de 2026. Proyecto: C:\Users\David\Sistema_Web_Final.

## Resultado de esta entrega

**52 fuentes existentes modificadas, 8 fuentes creadas y 3 archivos retirados.** Se corrigió un defecto funcional reproducido del visor PDF. Pruebas frontend: **69/69**; typecheck, lint y build: **exit 0**. Sin commit, push, despliegue, migraciones ni cambios en dependencias.

La implementación y el cierre técnico están terminados para esta entrega. **La matriz visual completa con las cinco cuentas locales no está terminada**: no se atribuye a estas pruebas una aprobación que no ocurrió. A petición del usuario se cerró el trabajo tras solucionar el defecto PDF y preparar este informe; los pendientes quedan explícitos abajo.

## Alcance y antecedentes

Se revisaron el inventario de fase 1, el estado posterior a fases 2–3 y el informe docs/LIMPIEZA_BACKEND_FASE_4_20261103.md. El inventario anterior está en C:/Users/David/.codex/visualizations/2026/11/03/01a19ebd-2ff3-7880-adaa-00ba7ce4ca4c/diagnostico-fase1/INFORME_DIAGNOSTICO_FASE_1.md. Se conservaron los cambios locales anteriores y los 494 archivos que ya existían en docs/.

El primer inventario revisó 1.269 archivos propios de código, herramientas y referencias, incluidos árboles privados sin leer archivos de entorno ni respaldos de datos para buscar consumidores. Desde main.tsx encontró 62 archivos activos y 63 fuera del grafo inicial. Incluyó imports, reexports y carga diferida literal; las menciones textuales se investigaron separadamente y no se tomaron por sí solas como ejecución. Tras las extracciones, el grafo actual contiene 69 archivos y **cero imports activos sin resolver**. Las fachadas administrativas conservadas son entradas de pruebas y no se confunden con pantallas duplicadas montadas.

## Corrección del criterio de cuentas y entorno

Al comienzo se preparó un cluster efímero y una interfaz en 5178 con cuentas sintéticas Fixture. Fue una decisión del agente para evitar escrituras sobre datos de trabajo. El usuario rechazó expresamente ese criterio y pidió usar las cinco cuentas locales existentes.

Se detuvieron el backend y Vite temporales; el runner confirmó: «Instancia temporal detenida y retirada; no se utilizó la base de trabajo». Se eliminaron el cluster con todas sus cuentas, los auxiliares propios que lo iniciaban y su configuración Vite. La consulta de solo lectura sobre sistema_web_documental_final:5432 comprobó **cero usuarios Fixture, Fictory o fase5_***. No se borró ninguna de las cuentas locales existentes.

Los recorridos posteriores usaron http://localhost:5173 y la cuenta existente **directora**, con la contraseña ya colocada en el navegador. Se conservaron superadmin, administrador, directora, secretaria y oficinista. No se crearon otras cuentas en la base local. Las capturas iniciales del entorno descartado no se utilizan aquí para declarar verificada la matriz de cinco roles locales.

## Archivos retirados

| Archivo | Qué hacía | Evidencia |
|---|---|---|
| frontend/src/features/documentos/components/RegistroDocumentoOpciones.tsx | Componente de opciones de registro del circuito sustituido | Sin imports ni referencias de código/herramientas en el inventario; las páginas activas renderizan su enlace único directamente. |
| frontend/src/features/dashboard/styles/Dashboard.module.css | Estilo del dashboard anterior, sustituido por Resumen y GraficosDashboard | Cero imports actuales; las menciones restantes son inventarios/copias históricas con resolución dentro de su propio árbol. El build activo usa otras hojas. |
| frontend/src/components/ui/EstadoPagina.module.css | Hoja anterior de estados de página, sustituida por Admin, EstadoCarga y Esqueleto | Cero imports actuales; las menciones restantes son inventarios/copias históricas con resolución dentro de su propio árbol. El build activo usa otras hojas. |

No se retiraron imágenes ni fuentes públicas: el escudo, los favicons, IBM Plex local y el comparador tipográfico mantienen consumidores o enlaces documentales concretos. Una ruta pública puede utilizarse por URL sin un import de React.

## Componentes y código reorganizados

| Grupo | Cambios concretos |
|---|---|
| Estructura, sesión y transporte | Se dio formato a rutas, API, hooks y sesión. Se retiraron comentarios mecánicos dentro de callbacks. AdminLayout se convierte en la implementación directa: se elimina el envoltorio que solo devolvía ContenidoAdminLayout sin aportar estado, props ni lógica. |
| Documentos | DocumentoDetallePage delega mutaciones a AccionesDocumento. DocumentoFormularioPage consulta el contexto y monta FormularioDocumento, que conserva registro, corrección y tratamiento posterior del PDF. Se mantienen revisiones, controles de envío, permisos del servidor y mensajes. |
| Administración | OficinasListaPage, OficinaDetallePage y OficinaFormularioPage separan listado, actividad y edición. TiposActualesPage, RolesActualesPage y CamposActualesPage separan catálogos de responsabilidades distintas. AppRoutes carga cada archivo mediante lazy; OficinasPages y ConfiguracionPages quedan como fachadas de reexportación porque las pruebas las importan. No quedan dos implementaciones de cada pantalla. |
| Dashboard | Formato del contenedor y de los gráficos, conservando cálculos, colores, leyendas, tablas alternativas, estados vacíos y navegación filtrada. No se descargan documentos para recalcular agregados en React. |
| PDF | Se ordenaron cliente, controles, selección local y visor. La carga de bytes y la paginación se separaron dentro de VisorPdf para corregir el estado heredado de otro archivo. El worker sigue importado desde pdfjs-dist con ?url y se sirve localmente. |
| CSS y recursos | Se eliminaron declaraciones sustituidas y clases PDF sin consumidor, manteniendo el orden de las declaraciones supervivientes y los contextos de tema/media. Se conservaron las clases dinámicas y los recursos públicos usados. |

Comentarios nuevos antes de funciones o bloques explican la invalidación de respuestas al cambiar sesión/documento, las revisiones concurrentes, los filtros en la URL, la carga PDF posterior al registro, la actividad separada de oficinas, los nombres históricos de campos, las cifras autorizadas del dashboard y el ciclo de carga/render del PDF. No se añadieron comentarios dentro de expresiones ni por cada línea.

Las líneas de más de 160 caracteres en las 52 fuentes modificadas pasan de **265 a 1**. No se usó un contador de comentarios como medida de calidad ni se reescribió la infraestructura de pruebas.

## Defecto funcional corregido: paginación al cambiar de PDF

**Reproducción anterior:** en el formulario local, seleccionar un PDF de dos páginas, avanzar a la página 2 y seleccionar otro de una página. La interfaz mostraba **Página 2 de 1** y «No se pudo mostrar esta página del PDF». La selección era solo local: no se envió el formulario ni se subieron objetos.

**Causa:** la misma instancia conservaba pagina, error y estado de render del archivo anterior. El efecto que recibía nuevos bytes sustituía el documento, pero no reiniciaba esa paginación.

**Corrección:** VisorPdf identifica el resultado por la referencia de bytes y el turno de carga; descarta resultados anteriores. PaginasPdf tiene el estado de página/render y se monta de nuevo al cambiar la carga. Se conserva la cancelación de tareas y la destrucción del documento anterior.

**Verificación después:** se repitió exactamente dos páginas → página 2 → una página. Resultado: **Página 1 de 1**, cero alertas, Anterior y Siguiente deshabilitados. Se guardaron [captura anterior](qa-limpieza-frontend-fase5/defecto-visor-antes.png) y [captura corregida](qa-limpieza-frontend-fase5/defecto-visor-corregido.png). La regresión se comprobó en navegador real; no se añadió una suite nueva ni se presenta como un test unitario adicional.

## CSS: duplicación eliminada y cascada preservada

| Hoja | Declaraciones sustituidas retiradas | Reorganización |
|---|---:|---|
| frontend/src/index.css | 0 | Formato de fuentes, tokens, temas y normas generales; valores conservados. |
| frontend/src/components/ui/Admin.module.css | 59 | Ocho reglas quedaron vacías al retirar declaraciones sustituidas y se eliminaron. Se mantienen reglas responsivas y estados. |
| frontend/src/components/layout/AdminLayout.module.css | 41 | Una regla vacía retirada; se conservan los puntos de quiebre actuales, menú modal y estilos de tema. |
| frontend/src/features/documentos/components/ArchivoPdf.module.css | 1 | Se unificaron las dos reglas adyacentes .paginas. Se retiraron .selectorOculto y .cabecera con sus descendientes/variante móvil sin acceso desde sus importadores; el input vigente utiliza hidden. |

Total: **101 declaraciones sustituidas**. Solo se retiró una declaración si había otra posterior del mismo selector y contexto, con prioridad igual o mayor. No se trasladaron declaraciones entre condiciones de media, tema o capas. Se dio formato al resto de las hojas activas; las hojas históricas de documentos se conservaron por sus consumidores anteriores.

Se conservaron expresamente styles[tipo] en Esqueleto, clases condicionales de estado/actividad, temas claro/oscuro, foco visible, movimiento reducido, estados de carga/error/vacío y controles accesibles. La hoja de confirmación sigue en uso por el diálogo Excel aunque el componente histórico Confirmacion no esté en las rutas activas.

La comparación DOM de Dirección verificó estilos calculados y dimensiones en **11 vistas estables** de dashboard, documentos y formulario con ambos temas/tamaños. La duodécima captura inicial del dashboard claro escritorio tenía 162 elementos frente a los 166 del gráfico ya renderizado, y se conserva como **no comparable**; no se contabiliza como coincidencia. Las once comparaciones estables no presentan diferencias de estilo/dimensión ni desborde horizontal. El visor real se recorrió además en los cuatro estados visuales. Las capturas no equivalen a una auditoría completa de lector de pantalla o zoom extremo.

## Recursos locales y dependencia de red

- IBM Plex Sans carga desde /fuentes/ibm-plex-sans/normal.ttf. Los imports de Tailwind se resuelven desde el paquete local durante el build.
- Escudo, iconos, favicons y tema-inicial.js se sirven desde el proyecto. El worker PDF se empaqueta con Vite; no se solicita a un CDN.
- Los url(...) de las CSS activas apuntan a la fuente local. El comparador público utiliza tres familias locales con sus licencias; sus enlaces de procedencia en metadatos/licencias no son solicitudes de fuente en ejecución.
- Las pantallas necesitan el API configurado; en el recorrido actual es el backend local. **El PDF persistido necesita Internet para obtener su objeto privado desde R2** mediante una URL temporal. No se declara que todo el sistema funcione sin conexión.
- No se cambiaron IBM Plex, la paleta, los tokens ni los temas deliberadamente. No se retiró la copia IBM del comparador por igualdad binaria: mantiene otra URL pública y documentos que la referencian.

## Verificaciones ejecutadas

| Comprobación | Resultado |
|---|---|
| Línea base frontend | 69/69 |
| Estructura/transporte | 69/69 |
| Documentos | 69/69 y typecheck aprobado |
| Administración | 69/69 y typecheck aprobado |
| Dashboard | 69/69 |
| PDF antes de la corrección | 69/69; la regresión de cambio de archivo se detectó después en navegador |
| CSS compartido | 69/69 |
| Cierre final tras corregir PDF | **69/69**, cero fallos/saltos/TODO |
| Typecheck / lint / build finales | **exit 0** en cada comando |
| git diff --check del frontend | Sin errores de whitespace |
| Imports activos sin resolver | 0 |
| Visor PDF existente RVINT2026006 | Lectura real, dos páginas, navegación y cuatro combinaciones tema/tamaño |
| Regresión cambio de PDF | Falla reproducida antes; Página 1 de 1 y cero alertas después |
| Datos de trabajo | Huellas de 21 tablas y valores de 12 secuencias iguales al cierre de fase 4, misma conversación; catálogo comparado idéntico |
| Conservación de archivos | 494 archivos previos de docs intactos; backend/src, database y frontend/public intactos |

Las pruebas frontend verifican contratos, sesión, rutas, gráficos, PDF y Excel con los mecanismos existentes. **No sustituyen un recorrido de escritura real en navegador.** No se ejecutó una prueba backend que creara nuevas cuentas después de la instrucción del usuario. No se modificaron datos para obtener pruebas verdes.

## Verificaciones pendientes, sin presentarlas como aprobadas

- Completar la matriz de navegador con superadmin, administrador, secretaria y oficinista en sus cuentas locales. La cuenta local que quedó autenticada y verificada fue directora. Un intento de entrar a secretaria con el estado de credenciales disponible fue rechazado; no se adivinaron contraseñas ni se alteraron cuentas para avanzar.
- Registro persistente completo, delegación/anulación y configuración administrativa mediante esas cuentas. Se verificaron formulario, carga de catálogos, selección local y componentes/contratos; no se guardó un registro nuevo.
- Descarga Excel real y cancelación desde el navegador en esta fase. El contrato, tipos seguros y estados de la exportación siguen cubiertos por las pruebas frontend existentes; esto no acredita una descarga manual nueva.
- Subida/reemplazo/eliminación PDF en R2 real. El recorrido real fue lectura del PDF existente y previsualización local, sin escritura de objetos.
- Completar antes/después visual de las pantallas administrativas con las cuentas locales. Las referencias sintéticas iniciales quedaron descartadas como evidencia de esas cuentas.

## Relación completa de archivos modificados

- frontend/src/api/client.ts
- frontend/src/api/conectividad.ts
- frontend/src/api/documental.ts
- frontend/src/App.tsx
- frontend/src/components/layout/AdminLayout.module.css
- frontend/src/components/layout/AdminLayout.tsx
- frontend/src/components/ui/Admin.module.css
- frontend/src/components/ui/Confirmacion.module.css
- frontend/src/components/ui/Esqueleto.module.css
- frontend/src/components/ui/SelectorTema.module.css
- frontend/src/features/auth/api/auth.api.ts
- frontend/src/features/auth/context/AuthProvider.tsx
- frontend/src/features/auth/hooks/useAuth.ts
- frontend/src/features/auth/pages/LoginPage.tsx
- frontend/src/features/auth/schemas/auth.schema.ts
- frontend/src/features/auth/services/AuthSession.ts
- frontend/src/features/auth/services/sessionStorage.ts
- frontend/src/features/auth/styles/Login.module.css
- frontend/src/features/dashboard/components/GraficosDashboard.module.css
- frontend/src/features/dashboard/components/GraficosDashboard.tsx
- frontend/src/features/dashboard/pages/DashboardPage.tsx
- frontend/src/features/dashboard/styles/Resumen.module.css
- frontend/src/features/documentos/api/pdf.api.ts
- frontend/src/features/documentos/components/ArchivoPdf.module.css
- frontend/src/features/documentos/components/ArchivoPdf.tsx
- frontend/src/features/documentos/components/AuditoriaDocumento.tsx
- frontend/src/features/documentos/components/ControlesPdf.tsx
- frontend/src/features/documentos/components/DestinoDocumental.tsx
- frontend/src/features/documentos/components/ExportarDocumentos.module.css
- frontend/src/features/documentos/components/ExportarDocumentos.tsx
- frontend/src/features/documentos/components/HistorialDocumento.tsx
- frontend/src/features/documentos/components/PrevisualizacionRegistroPdf.tsx
- frontend/src/features/documentos/components/VisorPdf.tsx
- frontend/src/features/documentos/pages/DocumentoDetallePage.tsx
- frontend/src/features/documentos/pages/DocumentoFormularioPage.tsx
- frontend/src/features/documentos/pages/DocumentosListaPage.tsx
- frontend/src/features/ubicaciones/pages/UbicacionesPage.tsx
- frontend/src/features/usuarios/pages/ConfiguracionPages.tsx
- frontend/src/features/usuarios/pages/OficinasPages.tsx
- frontend/src/features/usuarios/pages/UsuarioDetallePage.tsx
- frontend/src/features/usuarios/pages/UsuarioFormularioPage.tsx
- frontend/src/features/usuarios/pages/UsuariosListaPage.tsx
- frontend/src/hooks/consulta.ts
- frontend/src/hooks/useConsulta.ts
- frontend/src/hooks/useMenuMovil.ts
- frontend/src/index.css
- frontend/src/lib/fechas.ts
- frontend/src/lib/historialDocumental.ts
- frontend/src/lib/perfiles.ts
- frontend/src/lib/tema.ts
- frontend/src/main.tsx
- frontend/src/routes/AppRoutes.tsx

## Archivos productivos creados

- frontend/src/features/documentos/components/AccionesDocumento.tsx
- frontend/src/features/documentos/components/FormularioDocumento.tsx
- frontend/src/features/usuarios/pages/CamposActualesPage.tsx
- frontend/src/features/usuarios/pages/OficinaDetallePage.tsx
- frontend/src/features/usuarios/pages/OficinaFormularioPage.tsx
- frontend/src/features/usuarios/pages/OficinasListaPage.tsx
- frontend/src/features/usuarios/pages/RolesActualesPage.tsx
- frontend/src/features/usuarios/pages/TiposActualesPage.tsx

## Elementos conservados y motivos

Se conservaron 60 fuentes fuera del grafo inicial, por consumidores anteriores, pruebas, herramientas privadas o incertidumbre pendiente. El anexo [conservados.json](qa-limpieza-frontend-fase5/conservados.json) recoge por archivo imports, referencias completas y menciones. Es una matriz de investigación, no una certificación de que cada herramienta histórica sea compatible con el esquema actual.

Ejemplos concretos: los schemas administrativos/documentales tienen pruebas; EntregaSecretaria y DecisionDireccionCampos aparecen en herramientas privadas de ampliación/delegación; los módulos anteriores de movimientos/SíseVe no están montados pero conservan cadenas de imports y referencias de herramientas; las fachadas administrativas vigentes se usan en detalle-documental.test.mjs; los recursos del comparador siguen documentados y publicados por Vite. No se ejecutaron restauradores ni herramientas históricas para comprobar su uso.

Evidencias de esta fase: [manifiesto final](qa-limpieza-frontend-fase5/manifiesto-final.json), [retiradas](qa-limpieza-frontend-fase5/retiradas.json), [declaraciones CSS retiradas](qa-limpieza-frontend-fase5/css-retiradas.json), [comparación visual](qa-limpieza-frontend-fase5/comparacion-css.json) y [resultados de comandos](qa-limpieza-frontend-fase5/resultados-finales.json). Los logs completos y capturas están en la misma carpeta. No se sobrescribieron informes ni evidencias anteriores.
