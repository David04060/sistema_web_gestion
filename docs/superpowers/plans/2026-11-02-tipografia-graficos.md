# Tipografía y dashboards por rol — plan de ejecución

Solicitud vigente: conservar rediseño, márgenes, paletas y datos. Preparar primero tres propuestas tipográficas comparables; esperar selección antes de modificar fuente global. La elección posterior autoriza su aplicación sin pedir otra confirmación. Se autoriza investigar/desarrollar gráficos durante la espera. No commit, push, despliegue ni copias de base.

## Etapa 1 — comparación

- Fuentes sin modificar, descargadas del repositorio oficial google/fonts con OFL y metadatos: Public Sans, Source Sans 3, IBM Plex Sans. Pesos de muestra 400/500/600/700, cobertura latino/español. No instalar fuentes en el SO.
- Página aislada: frontend/public/comparar-tipografias/index.html; mismo muestra.html con familia por parámetro, paleta copiada de tokens actuales y sin imports en el frontend activo. Sus cifras se identifican como ilustrativas, sin consultas API.
- 12 vistas: tres familias × dos temas × escritorio/móvil. Foco, teclado, acentos, cifras, controles y desbordamiento mediante navegador. Preservar MASTER e index.css.
- Entregar URL y capturas; esperar A/B/C.

## Investigación de los dashboards

Fuente activa confirmada: backend/src/app.ts monta GET /api/dashboard directamente con dashboardActual de dashboard.documental.ts. dashboard.service.ts y dashboard.repository.ts contienen un circuito anterior; no utilizarlos ni reactivar sus movimientos. Contrato frontend activo: dashboardSchema en frontend/src/api/documental.ts. Los indicadores y recientes actuales se conservan.

Reglas actuales: lecturaSQL de shared/documental/nucleo.ts permite al Superadministrador todo, a Dirección/Secretaría registros no anulados, y a Usuario solo su ambito_id no anulado. Administrador se atiende por rama administrativa y excluye rol_id=1 de sus conteos. La identidad debe salir de la sesión revalidada, nunca de parámetros de rol/ámbito del cliente.

## Siguiente implementación autorizada

1. Escribir pruebas de privacidad y conteos antes de agregar estadísticas. Extender dashboardActual mediante consultas agregadas en una misma instantánea REPEATABLE READ READ ONLY. Sin migraciones y sin descargar listados completos al navegador.
2. Administrador: solo agregados administrativos (roles de cuentas, actividad, oficinas). Excluir Superadministrador en cada consulta y conteo; no emitir claves ni consultas documentales en esa rama.
3. Usuario: agregados personales, por situación y tipo, y registros por mes. Secretaría: gráficos de su ámbito compartido; pendientes Dirección como subconjunto claramente etiquetado. Dirección: separar ámbito compartido de documentos de ámbitos personales ajenos consultables; grupos mutuamente excluyentes. Superadministrador: global autorizado y cuentas/oficinas, distinguiendo vigente/anulado.
4. Serie temporal: últimos 12 meses calendario, incluido mes actual parcial, zona America/Lima. Fechas ISO en contrato, etiqueta de inicio/fin y zona visible. Meses sin registros = 0 en periodo definido; conjuntos sin documentos con mensaje vacío. Separar cantidades totales históricas de cifras del periodo.
5. Barras horizontales por tipo; serie mensual con cantidades; anillo solo para pocas categorías inequívocas (p.ej. cuentas activas/inactivas). Alternativa tabla accesible y cantidades/porcentajes con denominador explícito. Sin sumas de indicadores superpuestos ni gráficos duplicados.
6. Mantener DashboardPage, indicadores, accesos y recientes; agregar componentes acotados. Tokens semánticos compatibles con claro/oscuro, teclado, movimiento reducido y móviles. Sin nueva librería si SVG/CSS accesible basta.
7. Tras elección: aplicar familia seleccionada mediante tokens a todas las rutas activas, eliminar overrides accidentales y verificar PDF solo en sus controles, respetando el contenido del documento. Actualizar MASTER conservando decisiones previas. La fuente seleccionada puede optimizarse en una fase posterior conservando las licencias.
8. Ejecutar pruebas de cinco roles con datos locales sin alterar registros existentes; fixtures solo transaccionales con rollback, sin copias. Typecheck/lint/test/build backend y frontend pertinentes. Verificar navegador por rol; pedir inicio de sesión al usuario si no hay sesión disponible.

Estado al entregar muestras: etapa tipográfica de comparación preparada; fuente global y dashboards activos sin modificar. Implementación de agregaciones y verificación final pendientes de continuar, sin requerir nuevo permiso para el alcance ya solicitado.


## Avance tras la elección C · IBM Plex Sans

Selección recibida: autorizada la aplicación global sin nueva confirmación. Fuente local incorporada con OFL/metadatos; MASTER actualizado por adición. Agregaciones y gráficos implementados. Pruebas: frontend 62/62 y backend 32/32, tipos/lint/build correctos. Fixtures de estadísticas en tablas temporales con rollback; API de cinco roles sobre registros locales, con huellas iguales antes/después. Verificación visual por rol en curso; informe final documentará cada alcance y sus límites.

Verificación visual completada para los cinco perfiles y login, con los alcances documentados en docs/TIPOGRAFIA_Y_DASHBOARDS_LOCAL.md. Implementación, contratos, agregaciones y controles pertinentes finalizados; sin publicación.
