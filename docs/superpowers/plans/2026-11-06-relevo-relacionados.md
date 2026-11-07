# Relevo y relaciones — Implementation Plan

> For agentic workers: ejecutar por tareas con pruebas fallidas primero y revisión independiente final.

Goal: implementar el diseño aprobado sin transferir documentos ni ampliar escrituras históricas.
Architecture: periodos de asignación y procedencia inmutable por documento; política SQL compartida de lectura e histórico; reutilizar formulario y selectores. PostgreSQL 18, Express/TypeScript, React/Vite existentes.
Spec: ../specs/2026-11-06-relevo-relacionados-design.md

## Restricciones globales
Anulados exclusivos de Superadministrador. Histórico de periodos cerrados sin escrituras incluso Dirección/Secretaría. Preservar código/autor/PDF/ubicación/historia. Solo fixtures locales para mutaciones. Producción: respaldo, destino efectivo Render y verificaciones de lectura.

## Tareas
- [ ] SQL 008: oficina_periodos y documentos_oficina, exclusividad activa, funciones documento_consultable(actor bigint,doc bigint), documento_periodo_cerrado(doc bigint); guards de todas las mutaciones históricas. Backfill aborta ante movimientos de oficina ambiguos. Pruebas directas con rol restringido y matriz A→B→C.
- [ ] Backend relevo: GET /api/oficinas/:id/relevo (responsable y candidatos compatibles con versiones), POST misma ruta {saliente_id,reemplazo_id,version_saliente,version_reemplazo,motivo}; transacción con validación, revocación y copias auditadas de tipos. Backend nucleo usa las funciones SQL sin perder permisos actuales. Probar concurrencia/exclusividad, roles, tipos y conservación.
- [ ] Grupos: GET /api/documentos/origenes?q= devuelve {documentos:[{id,codigo_visible,asunto}],hay_mas}; detalle conserva relacionados y añade grupo {primero_id:null|string,inicio_visible:boolean,documentos:[{id,codigo_visible,asunto,origen_id:null|string,creado_en}]}. Filtro con_relacionados boolean en listado/exportación; aplicar componente completa y privacidad. SQL 009 adapta trigger de relación. Pruebas ciclos, ámbitos y paginación.
- [ ] Frontend: formulario de relevo en oficina con confirmación/motivo; combobox de origen y mismo formulario de alta; grupo ordenado y filtro con_relacionados. Render/contratos/accesibilidad y build.
- [ ] Verificar suites completas/regresión y estáticos; migrar local habitual con respaldo. Preflight/backup productivo, 008/009, commit, Render/Pages, verificar lecturas/bytes/roles sin mutaciones reales. Informe y evidencia separada por entorno.

## Review focus
Reactivar responsable anterior no abre periodo antiguo; Dirección/Secretaría actuales mantienen permisos habituales; R2 maintenance retención sigue funcionando; enlaces ocultos no filtran datos; colisiones de tipos abortan relevo sin desactivar parcialmente.
