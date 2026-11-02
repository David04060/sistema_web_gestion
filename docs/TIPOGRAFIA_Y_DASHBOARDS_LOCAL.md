# IBM Plex Sans y dashboards por rol — entrega local

Fecha: 2 de noviembre de 2026. Selección explícita del usuario: **C · IBM Plex Sans**. La autorización incluyó aplicación global, gráficos agregados por rol y verificación local, sin pedir de nuevo el mismo permiso. No se hicieron commit, push, despliegue, migraciones, copias de base ni instalaciones de paquetes.

## Tipografía aplicada

IBM Plex Sans local para todas las rutas activas: login, navegación, formularios, tablas, botones, números, gráficos SVG, historial, auditoría y controles PDF. Token --fuente-interfaz en frontend/src/index.css, con fallback Arial/system-ui. Binario variable original en frontend/public/fuentes/ibm-plex-sans/normal.ttf, 537 244 bytes. OFL.txt, METADATA.pb y manifest.json junto al archivo; el manifiesto incluye SHA-256. Archivo idéntico al original ya verificado en la comparación, sin modificar nombres reservados ni glifos. No hay dependencia externa de fuentes en ejecución.

Pesos de interfaz 400/500/600/700 e intermedios existentes soportados por la fuente variable, sin negrita sintética. Cifras tabulares/lining. Preload local y font-display:swap. Se mantuvieron tamaños, márgenes, geometría, logo y paletas de claro/oscuro; se compararon los tokens previos de color/geometría con la copia de la etapa de comparación y coinciden. El contenido de los PDF conserva su tipografía y color originales; el nuevo tipo se aplica a controles y contenedor.

El MASTER se actualizó por adición, conservando el contenido anterior y registrando la decisión aprobada. Se creó pages/dashboard.md para la variación de gráficos y ámbitos.

## Datos y gráficos

Endpoint vigente: **GET /api/dashboard**, montado en backend/src/app.ts y resuelto por dashboardActual en backend/src/modules/dashboard/dashboard.documental.ts. No se reactivó el circuito antiguo de dashboard.service.ts/repository ni movimientos.

Todas las consultas del dashboard comparten una transacción REPEATABLE READ READ ONLY. actorActual revalida identidad/rol/ámbito/actividad dentro de esa instantánea. Cada agregado documental reutiliza lecturaSQL y un filtro adicional de grupo. Parámetros de rol/ámbito del cliente se ignoran. El frontend recibe agregados y los ocho documentos recientes ya existentes; no descarga todos los registros para calcular estadísticas.

| Visualización | Fuente y significado |
|---|---|
| Barras de tipos documentales | GROUP BY documentos.tipo_nombre_guardado, únicamente vigentes y dentro del grupo autorizado. Todo el historial; cantidades y porcentaje respecto del total vigente del grupo. No utiliza nombres actuales para reetiquetar historia. |
| Serie mensual | GROUP BY mes de creado_en AT TIME ZONE America/Lima, con 12 meses calendario incluido el actual parcial. Separa vigentes/anulados según situación actual. Tabla con cantidades por mes; en móvil, lista mensual legible. |
| Distribución por situación del grupo compartido/ajeno | GROUP BY situacion dentro de cada ámbito, cantidades y porcentajes sobre el total del mismo grupo. Las tarjetas de situación originales se conservan; no se repiten en otro gráfico para Usuario/global. |
| Barras de cuentas por rol | roles.codigo + usuarios.rol_id, incluyendo activas/inactivas dentro del alcance administrativo. Se traducen los códigos del catálogo vigente a etiquetas. |
| Anillo de actividad de cuentas | Conteo de usuarios.activo, solo dos categorías; cantidades y porcentajes siempre en texto. |
| Oficinas activas/inactivas | Conteo por oficinas.activa. Se muestran cifras textuales para evitar repetir otro gráfico de dos categorías. |

La serie comienza el primer día del mes de hace once meses a medianoche de Perú y termina en el instante de la consulta. En esta revisión: 1 dic. 2025–2 nov. 2026, America/Lima. El mes actual se identifica como parcial. Las distribuciones de tipos/situaciones son históricas; no se confunden con cantidades del periodo mensual. Meses sin registros = 0 dentro de la ventana explícita. Conjuntos vacíos muestran mensajes y no dibujan datos inventados. Un historial anterior a la ventana puede conservar tipos históricos y mostrar ausencia de registros mensuales.

## Permisos y composición por rol

| Perfil | Contenido nuevo |
|---|---|
| Usuario | Solo su ambito_id personal y no anulados. Barras de tipos y serie mensual. Mantiene sus situaciones, recientes y accesos originales. |
| Secretaría | Gráficos únicamente del ámbito compartido; pendientes de Dirección como subconjunto de ese total. Texto visible aclara que resumen y recientes conservan el conjunto consultable previo. |
| Dirección | Ámbito compartido y ámbitos personales ajenos en grupos disjuntos. El segundo se abre mediante details con etiqueta solo lectura. No se suman categorías superpuestas. |
| Administrador | Solo cuentas/oficinas. Superadministrador excluido de roles, actividad y total de cuentas. La rama no ejecuta consultas documentales y no devuelve documentos, estados, recientes ni grupos documentales. |
| Superadministrador | Global documental autorizado y administración global. Total documental = vigentes + anulados; tipos solo vigentes y serie con ambas condiciones separadas. |

Indicadores, documentos recientes y accesos rápidos existentes se conservaron. No se añadieron módulos descartados ni permisos de escritura a partir de la consulta institucional.

## Accesibilidad y adaptación

Barras con cantidades, porcentajes y denominador en texto. Serie SVG con título/descripción y tabla nativa desplegable operable por teclado. En móvil se usa una lista de meses con cifras a tamaño normal, en vez de comprimir las etiquetas de la línea. Vigentes: línea sólida y círculos; anulados: línea discontinua y cuadrados. Anillo con cantidades y porcentajes fuera del dibujo. Controles y leyendas sin dependencia de hover ni de color como única señal. Sin animación de trazado. Paleta semántica anterior para ambos modos.

## Pruebas y evidencia

### Backend

- Suite npm test: **32 pruebas aprobadas, 0 fallidas**.
- npm run typecheck, npm run lint, npm run build: aprobados.
- Fixture de agregaciones: tablas TEMP locales dentro de transacción y ROLLBACK, sin alterar tablas persistentes. Casos de cinco roles, total/vigentes/anulados, ámbitos disjuntos, tipos, conjuntos vacíos, 12 meses y un registro a las 04:30 UTC que corresponde al mes anterior en Perú.
- Administrador probado con tabla temporal documentos eliminada: su rama sigue funcionando, demostrando que no requiere consultas documentales.
- API con JWT de las cinco cuentas locales activas, sin copiar ni guardar credenciales. Compara conteos con consultas independientes; intento de ampliar rol/ámbito por query no cambia el alcance. Anónimo recibe 401 y respuestas autenticadas usan no-store.
- Huellas y conteos de usuarios, documentos, documentos_pdf, auditoria_documental, auditoria_configuracion y pdf_cargas iguales antes/después de la prueba API. Huellas calculadas en PostgreSQL y conservadas solo en memoria; no son copias de base.

Durante la primera prueba de API se detectó que el catálogo real de roles usa codigo, no nombre. Se corrigió la consulta y el fixture para respetar el esquema real; se repitieron las pruebas y pasaron. No se alteró el esquema para acomodar la implementación.

### Frontend

- Suite npm test: **62 pruebas aprobadas, 0 fallidas**, incluidas las nuevas de contrato y render de gráficos.
- npm run typecheck, npm run lint, npm run build: aprobados.
- El contrato administrativo rechaza estadisticas.grupos_documentales; conteos negativos se rechazan. Render con cantidades, periodo, tabla, porcentajes y vacío sin NaN/Infinity ni serie ficticia.
- La primera prueba detectó un separador decimal supuesto incorrectamente: es-PE usa punto en este formateo. La expectativa se corrigió a 66.7; también se corrigieron títulos SVG para pasar una única cadena a React y evitar advertencias.

### Navegador con sesiones iniciadas por el usuario

| Perfil | Evidencia observada |
|---|---|
| Superadministrador | 5 cuentas, 6 oficinas, 16 documentos: 15 vigentes + 1 anulado. Barras de tipos, serie y tabla mensual real. IBM Plex Sans cargada. Escritorio claro y móvil oscuro sin desbordamiento. |
| Administrador | 4 cuentas, cuatro roles sin Superadministrador, actividad de cuentas y oficinas; ausencia de gráficas documentales. Escritorio claro y móvil oscuro sin desbordamiento. |
| Dirección | 11 compartidos + 4 personales ajenos, apertura con Enter del grupo de solo lectura, tipografía SVG, estados y barras. Texto con acentos/ñ y cifras retenido al alternar tema en registro sin guardar. |
| Secretaría | Un grupo compartido de 11 documentos y 5 pendientes; aclaración visible del alcance. 12 meses legibles en móvil. PDF existente: fuente correcta en controles, página 2 conservada al cambiar tema, historial/auditoría con IBM Plex Sans. |
| Usuario | 4 documentos personales, dos tipos con 2 registros cada uno (50 %/50 %), tabla mensual abierta por teclado, recientes y accesos conservados. Sin ámbitos ajenos ni administración. |

Estos números describen el estado local observado durante la revisión, no constantes incorporadas al código.

Se verificaron ambos temas y tamaños en los recorridos; no se ejecutó el producto cartesiano de cada URL × cada rol × cada tamaño × cada tema. Matriz explícita del dashboard Usuario: 320/375/768/1440 px × Claro/Oscuro, ocho combinaciones, scrollWidth = clientWidth en todas. Login: 1440/375 px × ambos temas, cuatro combinaciones sin desbordamiento y misma familia en títulos/campos/botones. Formularios, tablas y catálogos de usuarios, oficinas, roles, campos, ubicaciones y documentos comprobados por estilos calculados en la sesión autorizada. Los JSON y capturas están en docs/qa-dashboard/.

El control del navegador inicialmente falló al recuperar el enlace de la sesión; se reinició la herramienta y se recuperó la misma pestaña, sin cerrar la sesión del usuario. No quedó pendiente por ese fallo.

## Archivos de esta etapa

- frontend/src/index.css; frontend/index.html.
- frontend/public/fuentes/ibm-plex-sans/{normal.ttf,OFL.txt,METADATA.pb,manifest.json}.
- backend/src/modules/dashboard/dashboard.documental.ts.
- backend/tests/dashboard-estadisticas.local.test.mjs; backend/tests/dashboard-api.local.test.mjs; backend/package.json.
- frontend/src/api/documental.ts.
- frontend/src/features/dashboard/pages/DashboardPage.tsx.
- frontend/src/features/dashboard/components/GraficosDashboard.tsx y GraficosDashboard.module.css.
- frontend/tests/dashboard-graficos.test.mjs; frontend/package.json.
- design-system/paillardelle-documental/MASTER.md y pages/dashboard.md.
- docs/superpowers/plans/2026-11-02-tipografia-graficos.md; este informe; docs/qa-dashboard/.
- backend/dist y frontend/dist como compilaciones locales, sin publicación.

El árbol ya contenía cambios de otras tareas. Esta lista identifica la intervención actual; no atribuye todo el git diff a esta etapa. La comparación tipográfica y su informe se conservaron como evidencia de la elección.

## Límites reales

No se verificó con lector de pantalla completo ni zoom extremo; movimiento reducido está contemplado en los estilos existentes y los gráficos no incorporan animación. La ventana mensual es fija de 12 meses, sin selector de fechas nuevo. La distribución por tipo agrupa el nombre histórico guardado; no distingue entidades de catálogo diferentes que compartan ese mismo nombre, lo que se expresa en la ayuda del gráfico. Las muestras tipográficas conservan cifras ilustrativas aisladas; los dashboards activos utilizan únicamente datos agregados del backend.

No se probaron escrituras de negocio, cargas/reemplazos/borrados PDF o cambios de contraseñas en estos recorridos, porque esta etapa cambia tipografía y consultas de lectura. No hubo escrituras persistentes de los fixtures ni modificaciones deliberadas de cuentas/documentos/PDF existentes.
