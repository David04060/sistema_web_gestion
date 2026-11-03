# Corrección local de dashboards e interfaz

**Objetivo:** aplicar la petición del usuario del 2 de noviembre a las pantallas existentes, conservando IBM Plex Sans, cinco roles, rutas, permisos, agregados SQL y persistencia de tema.

**Arquitectura:** Recharts en el módulo diferido del dashboard. Adaptación de agregados existentes, sin consultar listados para estadísticas ni cambiar SQL. Tokens centrales neutros y acentos del escudo. Estados compartidos de carga según contenido. Implementación directa en esta sesión; sin commits, push, migraciones ni despliegues.

## Tareas

- [x] Probar y desarrollar la selección de periodo: conservar ceros intermedios, todos los meses en tabla, cero actividad sin línea, un mes con columnas. Archivos: `frontend/src/features/dashboard/components/GraficosDashboard.tsx`, `frontend/tests/dashboard-graficos.test.mjs`.
- [x] Sustituir gráficos: anillo de situaciones, comparación de tipos, tendencia mensual; cuentas por rol, activas/inactivas y oficinas para administración. Todos con denominador, cantidades, porcentajes y alternativa textual. Enlaces filtrados solo cuando el listado tiene el mismo ámbito. Archivos: `GraficosDashboard.tsx`, `GraficosDashboard.module.css`.
- [x] Reorganizar `DashboardPage.tsx`: saludo corto, indicadores, gráficos y accesos; actualización con datos conservados y estado anunciado; esqueleto inicial sin cifras ficticias.
- [x] Corregir tokens en `index.css`, jerarquía compartida en `Admin.module.css`, carga en `EstadoCarga.tsx` y espacio del visor en `ArchivoPdf.module.css`. Revisar textos de todas las rutas activas y conservar avisos operativos y de permisos.
- [x] Ejecutar pruebas frontend/backend, typecheck, lint y build. Contrastar agregados API con SQL de solo lectura en cinco sesiones. Navegador local: cinco roles × dos temas × 1440/768/375; PDF, cargas lentas, vacío y error/reintento. Guardar capturas y resultados reales.
- [x] Actualizar el diseño guardado y entregar informe con límites de verificación.

## Riesgos que verificar

1. Un ámbito compartido no equivale a todo el listado institucional: no enlazar sus sectores a filtros de alcance mayor.
2. Un solo mes de actividad no justifica una tendencia; los meses retirados visualmente deben seguir disponibles.
3. Administrador jamás recibe/renderiza documentos ni incluye Superadministración en denominadores.
4. Leyendas largas y tablas de gráficos no deben desbordar móvil.
5. Tema y tamaño no deben desmontar el PDF ni perder formularios; papel PDF conserva original.
