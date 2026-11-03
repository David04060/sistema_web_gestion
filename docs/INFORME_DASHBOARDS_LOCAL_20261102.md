# Informe de dashboards e interfaz — revisión local del 2 de noviembre de 2026

## Resultado y alcance

Corrección aplicada exclusivamente en C:\Users\David\Sistema_Web_Final, sobre la versión local existente. Se conservaron IBM Plex Sans, cuentas, cinco roles, permisos, rutas, flujos, agregaciones SQL, documentos, PDF y preferencia paillardelle-tema. No hubo commits, push, migraciones ni despliegues. Los servidores locales ya estaban disponibles en localhost:5173 y 127.0.0.1:3000; los servidores temporales de QA se cerraron.

Las imágenes de referencia no estaban adjuntas en el contexto de esta solicitud. La composición se basó en la descripción del usuario y en el sistema de diseño guardado; no se volvió a ejecutar la skill de diseño.

## Qué cambió

- Gráficos completos con Recharts 3.10.1: anillos, barras con ejes y cantidades, y actividad temporal. ResponsiveContainer adapta los gráficos al panel. Tooltip, foco, flechas del teclado y tablas/leyendas con las mismas cifras. Biblioteca contenida en la ruta diferida del dashboard; no se descarga para presentar el login. El módulo del dashboard resultante ocupa aproximadamente 119 kB gzip; es una dependencia nueva del frontend.
- Cabecera específica por perfil, indicadores compactos, acentos semánticos coherentes con las leyendas y gráficos antes de accesos rápidos y recientes. Se añadió «Documentos consultables» para distinguir las tarjetas institucionales del grupo compartido sin una explicación extensa.
- Eliminados del dashboard los textos de zona horaria, «mes actual parcial», «los grupos no se superponen» y párrafos técnicos de alcance. Limpieza adicional en cuentas, oficinas, tipos, campos, ubicaciones, conectividad y PDF. Se conservaron advertencias operativas y de permisos. Los asuntos y contenidos documentales reales no se reescribieron.
- Paleta del escudo inspeccionado: azul, dorado y terracota como acentos; verde para guardado/actividad y rojo para error/anulado. Fondos claros neutros y oscuro de grafito con capas distinguibles. Tokens centrales aplicados a todas las rutas activas, login, navegación, formularios, historial, modales y visor. Metadato del navegador actualizado al grafito. IBM Plex Sans y persistencia del tema conservadas.
- Escala de títulos, paneles, cifras, ayudas y controles; espaciado consistente. PDF con relleno para metadatos, herramientas, paginación y separación del papel. No se modificaron el motor ni los bytes, fuentes o contenido de los PDF existentes.
- Esqueletos de dashboard, filas de lista, detalle y PDF, con anuncio accesible y sin cifras ficticias. Actualizaciones conservan resultados y anuncian el proceso. Se evitó el falso vacío de ubicaciones durante la consulta.
- Durante QA se detectó que la consulta inicial del PDF carecía de reintento. Se reprodujo con HTTP 500 y se añadió el botón que recupera esa consulta sin recargar toda la vista. La regresión de navegador falló antes del cambio y pasó después.

## Qué representa cada gráfico

| Perfil | Visualizaciones | Cifras observadas en la sesión local |
|---|---|---|
| Usuario | Situación personal; tipos vigentes; registros por mes | 4 documentos: 3 personales y 1 delegado |
| Secretaría | Situación, tipos y actividad mensual del grupo compartido | 11 documentos compartidos: 5 delegados, 1 guardado y 5 pendientes |
| Dirección | Gráficos compartidos y sección plegable de ámbitos personales ajenos, solo lectura | 11 compartidos y 4 personales ajenos; 15 consultables en sus tarjetas |
| Administrador | Cuentas por rol; activas/inactivas; cifras de oficinas | 4 cuentas activas, 0 inactivas; 6 oficinas activas. Superadministración excluida; sin agregados documentales |
| Superadministrador | Situación global, tipos vigentes, actividad mensual con anulados separados; cuentas y oficinas | 16 documentos: 15 vigentes y 1 anulado; 5 cuentas activas; 6 oficinas activas |

Estos valores son observaciones, no constantes del frontend. Todos proceden de GET /api/dashboard. Los anillos dividen por el total del grupo; las barras documentales por los vigentes del grupo; las barras de cuentas por la suma de roles autorizados; el anillo de actividad por activas + inactivas. Cantidades, porcentajes y nombres completos están en leyendas, tooltip o tablas nativas desplegables.

Dirección y Secretaría conservan sus tarjetas y recientes de todos los documentos consultables. Su anillo compartido representa 11 documentos, por eso puede diferir de las tarjetas superiores. No se suman agregados superpuestos. Solo los anillos personal/global enlazan a /documentos?situacion=…; los grupos compartidos y de lectura no prometen filtros cuyo listado tenga un alcance diferente.

La ventana SQL sigue siendo de doce meses. El gráfico muestra por defecto desde el primer mes con actividad hasta el último y conserva los ceros intermedios. «Todos los meses» y la tabla conservan la ventana completa. La base local tenía todos los registros del periodo en un solo mes: se dibujan columnas. Un periodo sin actividad muestra un estado vacío y tabla. Una tendencia con dos meses activos y un cero intermedio se probó con una respuesta controlada, sin insertar datos.

## Evidencia y controles

| Control | Resultado |
|---|---|
| Frontend npm test | 65 aprobadas, 0 fallidas |
| Frontend typecheck, lint y build | Salida 0 |
| Backend npm test | 32 aprobadas, 0 fallidas |
| Backend typecheck, lint y build | Salida 0; build incluido en npm test |
| Dashboards con datos reales | Cinco roles × claro/oscuro × 1440/768/375 px: 30 combinaciones; cantidades de tablas contrastadas con la API, sin errores de JS ni desbordamiento |
| Pantallas principales | 174 combinaciones de rutas/rol/tema/tamaño, incluidas 18 previsualizaciones PDF con página 2 y asunto conservados |
| Login y detalles | Otras 54 combinaciones; detalle documental, cuentas, oficinas e historial/auditoría |
| Visor con herramientas | 18 combinaciones de tres roles documentales × temas × tamaños; PDF local de prueba, sin escritura |
| Red y recuperación | Carga lenta, HTTP 500 y reintento en los cinco dashboards; carga lenta/error/reintento/vacío de lista; error y reintento inicial del PDF |
| Gráficos y teclado | Tooltip al enfocar y usar flechas; selector del periodo completo; 3 puntos con cero intermedio y 12 en periodo completo; vacío sin gráficos ficticios |
| SQL/API y permisos | Suite local con cinco sesiones; comprobaciones independientes de totales, tipos, periodo y exclusión administrativa. Parámetros de rol/ámbito no amplían la respuesta |
| Conservación | Huellas antes/después del recorrido final iguales en usuarios, documentos, documentos_pdf, auditoria_documental, auditoria_configuracion y pdf_cargas. La prueba API también compara huellas en cinco sesiones |

Las pruebas SQL usan tablas temporales y rollback cuando necesitan escenarios de datos; no se ejecutaron migraciones. Los recorridos reales enviaron solo lecturas. Las respuestas controladas para vacío, tendencia y fallos se interceptaron en el navegador; el PDF de herramientas se generó en memoria y se sirvió localmente. No se sustituyeron cifras de producción ni se enviaron esos archivos a almacenamiento.

Contraste calculado con luminancia sRGB de los tokens:

| Pareja | Claro | Oscuro |
|---|---:|---:|
| Texto / superficie | 15,06:1 | 13,64:1 |
| Texto secundario / superficie | 6,10:1 | 8,63:1 |
| Texto secundario / superficie secundaria | 5,30:1 | 7,46:1 |
| Enlaces / superficie | 7,29:1 | 9,02:1 |
| Borde de control / superficie | 3,71:1 | 4,61:1 |
| Marcas de gráficos / superficie, mínimo | 3,75:1 | 6,98:1 |

Los gráficos emplean texto neutro para leyendas y cantidades; el dorado es marca gráfica, no texto pequeño sobre blanco. Navegador ejecutado con movimiento reducido. Esta medición no equivale a una auditoría de cada píxel o una certificación de accesibilidad.

## Capturas y reproducción

[Índice de capturas comparables](qa-dashboard-20261102/CAPTURAS.md). [Evidencia estructurada](qa-dashboard-20261102/resultados.json).

Parejas recomendadas: [Dirección claro](qa-dashboard-20261102/vista-rol-3-claro.png) / [oscuro](qa-dashboard-20261102/vista-rol-3-oscuro.png); [Administrador claro](qa-dashboard-20261102/rol-2-claro-1440.png) / [oscuro](qa-dashboard-20261102/rol-2-oscuro-1440.png); [Usuario móvil claro](qa-dashboard-20261102/rol-5-claro-375.png) / [oscuro](qa-dashboard-20261102/rol-5-oscuro-375.png); [PDF móvil claro](qa-dashboard-20261102/visor-controles-3-claro-375.png) / [oscuro](qa-dashboard-20261102/visor-controles-3-oscuro-375.png).

Scripts reproducibles en backend/scripts: verificar-dashboard-visual.local.mjs (Express local sin colector, Vite temporal, SQL y capturas); verificar-interfaz-adicional.local.mjs y verificar-estados.local.mjs (requieren servidores existentes en localhost:5173 y 127.0.0.1:3000). Usan las cuentas locales vigentes y JWT efímeros en memoria; no guardan credenciales. Los dos primeros no ejecutan acciones de escritura; el de estados intercepta fallos sin cambiar datos. Requieren el runtime Playwright disponible en este equipo.

El diseño guardado se actualizó en design-system/paillardelle-documental/MASTER.md y pages/dashboard.md. Documentación primaria usada para integrar la biblioteca: [Recharts: accesibilidad](https://github.com/recharts/recharts/blob/main/storybook/stories/API/Accessibility.mdx) y [ResponsiveContainer](https://recharts.github.io/api/ResponsiveContainer/).

## Límites y pendientes reales

- Las pantallas se recorrieron en Chrome de escritorio con ventanas de 1440, 768 y 375 px; no son pruebas físicas en teléfonos/tabletas ni de todos los navegadores.
- Se verificaron foco, teclado de gráficos y movimiento reducido; queda una auditoría completa con lector de pantalla, zoom extremo y otras tecnologías de asistencia.
- Para conservar datos no se confirmaron altas, correcciones, delegaciones, anulaciones, activación/desactivación, contraseñas ni subida/reemplazo/borrado de PDF. Mensajes y contratos tienen cobertura automatizada; no se afirma una transacción real de éxito en esta revisión.
- El visor con herramientas usó un PDF local de prueba y metadatos interceptados. El detalle y sus permisos se consultaron realmente; esta prueba no certifica lectura remota actual desde R2, subida en curso ni recuperación de un servicio remoto.
- La tendencia multimes y los vacíos se probaron con fixtures identificadas; la base local real solo permite comprobar directamente las columnas de un mes.
- No se verificó ni se cambió ninguna publicación remota. El resultado está listo para revisión local en http://localhost:5173/dashboard con las cuentas existentes.
