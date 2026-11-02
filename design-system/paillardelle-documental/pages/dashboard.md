# Dashboard — variación del MASTER

Consultar ../MASTER.md, incluida la decisión IBM Plex Sans aprobada el 2 de noviembre de 2026. Se conservan márgenes, paletas, indicadores, accesos rápidos y documentos recientes existentes.

## Preguntas y representación

- Tipos documentales vigentes: barras horizontales con nombre registrado, cantidad y porcentaje del total vigente del grupo. Largo relativo al mayor conteo; denominador visible. Lista textual siempre disponible.
- Registros por mes: serie temporal de 12 meses calendario, incluido el actual parcial, zona America/Lima, con tabla nativa desplegable. Vigentes en línea sólida/círculos, anulados en línea discontinua/cuadrados cuando existan; el color nunca es la única diferencia. En móvil se presenta una lista mensual con cantidades legibles en lugar de encoger las etiquetas del SVG.
- Cuentas por rol: barras de cantidades y porcentaje de cuentas visibles. Actividad de cuentas: anillo solo para las dos categorías activa/inactiva, acompañado de cantidades y porcentajes en texto.
- Oficinas activas/inactivas: cantidades textuales. No añadir otro gráfico que repita la distribución de dos categorías del anillo.

## Ámbitos

- Usuario: personal propio, no anulados. Sus tarjetas de situación ya existentes se conservan; no repetirlas en otro gráfico.
- Secretaría: gráficos del ámbito compartido; pendientes de Dirección son un subconjunto del mismo total. El resumen/recientes existente mantiene su alcance autorizado previo y los gráficos llevan su ámbito explícito.
- Dirección: compartido y personales ajenos en grupos mutuamente excluyentes. El segundo grupo se consulta en un details con etiqueta solo lectura, sin sumar indicadores superpuestos.
- Administrador: solo cuentas/oficinas; no solicitar ni renderizar series documentales. Excluir Superadministrador en cada denominador administrativo.
- Superadministrador: global autorizado; total = vigentes + anulados. Tipos únicamente vigentes; serie mensual distingue ambas condiciones. Datos administrativos globales incluyen todos sus roles autorizados.

## Estados y accesibilidad

Sin datos: mensajes claros sin gráficos ficticios. Meses sin registros: cero dentro del periodo explícito; no extrapolar fechas fuera de la ventana. Meses con total cero en todo el periodo: mensaje y tabla, sin línea decorativa. Si solo hay datos históricos anteriores a la ventana, mantener la distribución histórica y explicar que no hay registros en el periodo mensual.

IBM Plex Sans para HTML, SVG y cifras tabulares. Controles details con teclado y foco heredado; etiquetas, pies, leyendas y tablas usan tokens actuales en ambos modos. Puntos y leyendas no dependen de hover. Sin animación de trazado. Unidades documentales y administrativas no se mezclan.

## Fuente ejecutable

GET /api/dashboard → backend/src/modules/dashboard/dashboard.documental.ts, consultarDashboard dentro de REPEATABLE READ READ ONLY. Identidad revalidada por actorActual; lecturaSQL limita cada agregado documental. No hay descarga de documentos completos para calcular gráficos. Frontend: api/documental.ts y features/dashboard/components/GraficosDashboard.tsx.
