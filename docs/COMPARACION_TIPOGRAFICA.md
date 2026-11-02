# Comparación tipográfica — primera etapa

Página local: http://localhost:5173/comparar-tipografias/index.html
Archivo: frontend/public/comparar-tipografias/index.html

## Estado y alcance

Se prepararon muestras aisladas. No se modificó la fuente global, el MASTER vigente, los márgenes de las pantallas activas ni sus tokens de color. No se cambiaron endpoints, contratos, consultas o gráficos todavía. No hubo commit, push, despliegue, copias de base ni modificaciones de cuentas/documentos/PDF. La siguiente etapa tipográfica espera la selección del usuario; esa selección autorizará la aplicación a todas las pantallas sin otra confirmación del mismo permiso.

Se buscó AGENTS.md en todo el proyecto con rg --files --hidden, excluyendo node_modules/.git, y en C:/, C:/Users/ y C:/Users/David/. No se encontró. Se leyeron .agents/skills/ui-ux-pro-max/SKILL.md, las secciones pertinentes de quick-reference.md y el MASTER vigente. Las otras guías de planificación/pruebas/verificación de .agents se consultaron como apoyo.

## Propuestas

| Opción | Familia para toda la muestra | Intención |
|---|---|---|
| A | Public Sans | Institucional sobria y directa; formas sólidas y títulos firmes. Proyecto USWDS. |
| B | Source Sans 3 | Lectura abierta y fluida en párrafos, ayudas y formularios. Proyecto Adobe. |
| C | IBM Plex Sans | Precisión y carácter contenido en tablas, cifras y códigos. Proyecto IBM/Bold Monday. |

Se usa una familia por propuesta para comparar su personalidad sin introducir una segunda variable. Pesos de muestra 400/500/600/700; base y campos 16 px, botones y tabla 15 px, título 30 px/26 px móvil, subtítulo 18 px y metadatos 13–14 px. Cifras tabulares. Las tres muestras comparten exactamente el mismo HTML y contenido, incluida navegación, título/subtítulo, cifra, párrafo, formulario, tabla, botones, etiquetas de gráfico e historial. Las cifras están señaladas como ilustrativas; la página no consulta ni representa estadísticas reales del sistema.

## Búsquedas de la skill y fuentes primarias

Se ejecutaron búsquedas typography sobre legibilidad institucional, google-fonts sobre Public Sans y Source Sans, y typography sobre IBM Plex. La primera búsqueda google-fonts de IBM Plex Sans priorizó variantes KR/Condensed; se afinó a typography IBM Plex, cuyo resultado identifica IBM Plex Sans para títulos y cuerpo. No se persistió una recomendación equivocada ni se regeneró el MASTER.

La detección local confirma React 19.3.1 en el proyecto. La guía --stack react consultada identifica recomendaciones de accesibilidad de consultas de pruebas sobre 19.2.x; no se aplicaron APIs de una versión supuesta ni se añadió una dependencia al frontend.

Fuentes originales:
- https://github.com/uswds/public-sans
- https://github.com/adobe-fonts/source-sans
- https://github.com/IBM/plex

Distribución de los binarios descargados y sus avisos:
- https://github.com/google/fonts/tree/main/ofl/publicsans
- https://github.com/google/fonts/tree/main/ofl/sourcesans3
- https://github.com/google/fonts/tree/main/ofl/ibmplexsans

Las tres familias se distribuyen bajo SIL Open Font License 1.1. Se incluyeron íntegros OFL.txt, METADATA.pb y binarios originales sin modificar. Public Sans incorpora modificaciones USWDS con CC0 sobre una base OFL; se siguen los términos OFL para el conjunto, según la licencia oficial. No se modificaron nombres reservados ni se vendieron las fuentes por separado. El manifiesto fuentes/manifest.json registra tamaño y SHA-256 de cada binario. Todas se sirven desde la misma instalación local: no hay @import remoto ni solicitud a Google Fonts al visualizar la página. Los enlaces a los autores son referencias opcionales, no dependencias de carga.

## Archivos nuevos

- frontend/public/comparar-tipografias/index.html — comparación accesible, selectores nativos de tema/tamaño y enlaces entre opciones.
- frontend/public/comparar-tipografias/comparacion.js y comparacion.css — controles comunes y ajuste de altura de muestras.
- frontend/public/comparar-tipografias/muestra.html, muestra.js y muestra.css — contenido único para tres familias; interacciones de demostración sin API.
- frontend/public/comparar-tipografias/paleta.css — copia aislada de los tokens actuales; no altera los del sistema.
- frontend/public/comparar-tipografias/fuentes.css — @font-face locales exclusivos de las muestras.
- frontend/public/comparar-tipografias/fuentes/{publicsans,sourcesans3,ibmplexsans}/ — binarios originales, OFL.txt y metadatos.
- frontend/public/comparar-tipografias/fuentes/manifest.json.
- docs/qa-tipografias/ — evidencias y capturas.
- docs/superpowers/plans/2026-11-02-tipografia-graficos.md — investigación del endpoint vigente y plan de estadísticas por permisos.
- docs/COMPARACION_TIPOGRAFICA.md — este informe.

## Verificación

Navegador integrado, sin iniciar sesión ni consultar la base para las muestras:
- Tres familias × Claro/Oscuro × 1100×1100 y 375×812: 12 combinaciones. document.fonts.ready y document.fonts.check confirman la carga de la familia real de cada propuesta. getComputedStyle confirma su aplicación.
- scrollWidth = clientWidth en las 12 combinaciones: sin desbordamiento horizontal.
- Página contenedora comprobada también a 1440 y 375 px, sin desbordamiento; selectores de tema y tamaño y navegación por anclas operativos.
- Campo con etiqueta visible, texto con acentos/ñ, Tab al botón y Enter: interacción de demostración anunciada mediante role=status. Foco medido de 3 px.
- Los archivos TTF se inspeccionaron por su tabla cmap: cobertura de ÁÉÍÓÚáéíóúÑñüÜ¿¡0123456789%/.,;:() y guiones largo/medio, sin caracteres ausentes. Resultado en docs/qa-tipografias/cobertura.json.
- Pesos 400/500/600/700 declarados, sin sintetizar negritas ni usar variantes condensadas. La revisión visual no reemplaza una evaluación exhaustiva con lector de pantalla.
- node --check para ambos JavaScript de muestra: correcto.
- npm test del frontend: 59/59 aprobadas, 0 fallidas.
- npm run typecheck, npm run lint y npm run build: aprobados. El lint del proyecto no incluye reglas específicas para public; los scripts nuevos tienen comprobación de sintaxis y recorrido real en navegador.
- Los archivos de comparación y fuentes quedan copiados por Vite en dist, sin publicación.

## Investigación de dashboards y pendientes

Endpoint activo confirmado en backend/src/app.ts: GET /api/dashboard con dashboardActual, implementado en backend/src/modules/dashboard/dashboard.documental.ts. No se debe usar el servicio de dashboards del circuito antiguo, que permanece en disco. Las reglas se contrastaron con lecturaSQL y la estructura de ambitos_registro: un ámbito compartido y ámbitos personales.

Se documentó el plan de consultas agregadas por rol, en instantánea de solo lectura, con periodo de 12 meses calendario (incluido mes actual parcial) y zona America/Lima. Administración excluirá rol_id=1 de todos sus agregados y no ejecutará consultas documentales. Dirección separará el ámbito compartido de los personales ajenos consultables. Superadministración distinguirá vigentes/anulados. No se implementaron todavía esas agregaciones ni gráficos y no se han probado sus respuestas en esta etapa.

Pendientes tras la elección: aplicación global de la familia seleccionada, actualización del MASTER, implementación y pruebas de agregaciones/privacidad para cinco roles, gráficos accesibles reales y verificaciones finales frontend/backend. Los PDF existentes conservarán su contenido; la fuente seleccionada se aplicará a los controles del visor.
