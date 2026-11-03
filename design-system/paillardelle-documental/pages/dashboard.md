# Dashboard — decisiones finales del 2 de noviembre de 2026

Esta especificación reemplaza la versión anterior de esta página. Se aplica junto a la última decisión de MASTER.md. IBM Plex Sans local; gráficos dentro de la ruta diferida, sin fuentes ni datos externos.

## Composición

Título breve por rol, saludo, actualización y registro cuando corresponda. Indicadores documentales en cuadrícula adaptable; colores por situación estables y coincidentes con el anillo. Gráficos antes de accesos rápidos y recientes. Paneles independientes, superficies neutras, bordes discretos. Dos columnas en escritorio y tableta; una bajo 650 px. Cifras resumidas en dos columnas en móvil.

## Visualizaciones y fuentes

Fuente única: GET /api/dashboard, validada con dashboardSchema de frontend/src/api/documental.ts. Recharts 3.10.1, sin animaciones, ResponsiveContainer, ejes, cuadrícula, tooltip y navegación con teclado. No se consultan listados para obtener estadísticas.

- Usuario: anillo de situación personal, barras de tipos vigentes y actividad por mes.
- Secretaría: anillo de situación del ámbito compartido, barras de tipos y actividad mensual de ese mismo grupo. Las tarjetas superiores y recientes conservan el conjunto autorizado original y pueden incluir documentos de otros ámbitos consultables. El título de cada grupo distingue su alcance.
- Dirección: grupo compartido y grupo de ámbitos personales ajenos en sección plegable «solo lectura». No sumar estos gráficos con las tarjetas de resumen.
- Administrador: barras de cuentas por rol, anillo de activas/inactivas y cifras de oficinas. No solicita documentos; Superadministración no entra en sus denominadores.
- Superadministrador: distribución global incluyendo anulados, tipos vigentes y actividad mensual con anulados separados. Además, cuentas y oficinas globales.

Anillos: leyenda completa con cantidades y porcentajes; centro con total. Situaciones: personal azul, pendiente dorado, delegado terracota, guardado verde, Mesa de Partes gris, anulado error. Actividad: activa verde, inactiva gris. Barras: escala de cantidades, etiquetas y tabla de cantidades y porcentajes; nombres largos completos en tooltip y tabla.

Enlaces de las leyendas a /documentos?situacion=… solo para los grupos personal y global, cuyo ámbito coincide con el listado. Los grupos compartidos y ajenos no enlazan a un filtro que amplíe su alcance.

## Tiempo, ceros y accesibilidad

Ventana del backend: doce meses calendario. Encabezado breve con meses inicial/final y cantidad. Por defecto el gráfico abarca desde el primer mes con registros hasta el último, conservando ceros intermedios. Selector «Todos los meses» recupera la ventana completa. Se indica cuántos meses no tienen registros; la tabla conserva siempre los doce meses y las cifras de vigentes/anulados/total.

Solo un mes activo: columnas, sin simular tendencia. Ninguno activo: vacío informativo y tabla; no dibujar una línea plana. Dos o más: línea de vigentes, anulados discontinua si corresponde. Color, texto y estilo de línea se complementan.

Tablas nativas desplegables y leyendas disponibles sin hover. Tooltip con cantidades; anillos y barras también porcentajes. Foco visible, flechas en los gráficos y controles nativos. Sin animación, compatible con movimiento reducido. Carga inicial con esqueleto y sin cifras ficticias; actualización conserva cifras y anuncia el proceso; error con reintento.

## Evidencia

Ver docs/INFORME_DASHBOARDS_LOCAL_20261102.md y docs/qa-dashboard-20261102. El informe distingue respuestas reales, escenarios sintéticos de navegador y límites. No modificar cuentas, documentos, PDF ni permisos para presentar datos.

## Ajuste posterior de color — 2 de noviembre de 2026

Aplica la última paleta de MASTER.md: negro #08090b, capas oscuras diferenciadas y gráficos más nítidos en ambos temas. Las tarjetas claras conservan sus acentos mediante --indicador-*; las visualizaciones usan --grafico-*.

Las barras por tipo/rol usan colores estables por categoría y marcas de leyenda en su propio eje, sin cambiar tamaños ni distribución. Los meses mantienen un color por serie: azul vigentes y rojo anulados cuando existan. Las columnas muestran cantidades. No añadir categorías o series para llenar la paleta; un tipo o un mes activo se indican brevemente. Evidencia específica: docs/AJUSTE_PALETA_OSCURA_20261102.md.
