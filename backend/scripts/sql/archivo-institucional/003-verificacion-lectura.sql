-- PREPARADO; NO EJECUTADO. Inspeccion posterior a 001+002, antes de habilitar uso.
-- No sustituye pruebas de INSERT/UPDATE/concurrencia en QA. La conexion debe
-- poder ver todas las filas: row_security=off falla en lugar de ocultarlas.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL row_security = off;
SELECT current_database() AS base, current_setting('neon.branch_id',true) AS rama;

WITH esperadas(nombre) AS (VALUES
 ('archivos_institucionales'),('archivos_asignaciones'),('documentos_archivos'),
 ('ingresos_mesa_partes'),('ingresos_actuaciones'),('movimientos_ingresos'),
 ('archivos_relevos'),('relevos_documentos'),('movimientos_sustituciones'),
 ('sustituciones_actuaciones'),('auditoria_archivistica'))
SELECT e.nombre,c.oid IS NOT NULL AS existe,c.relrowsecurity,c.relforcerowsecurity,
 EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid
  AND t.tgname='aa_ai_modelo_dormido' AND t.tgenabled IN ('O','A')) AS uso_bloqueado,
 (SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid) AS politicas
FROM esperadas e LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||e.nombre)
ORDER BY e.nombre;

-- Antes de cualquier uso: once tablas vacias; no aceptar conteos filtrados.
SELECT 'archivos_institucionales' AS tabla,count(*) AS filas FROM public.archivos_institucionales
UNION ALL SELECT 'archivos_asignaciones',count(*) FROM public.archivos_asignaciones
UNION ALL SELECT 'documentos_archivos',count(*) FROM public.documentos_archivos
UNION ALL SELECT 'ingresos_mesa_partes',count(*) FROM public.ingresos_mesa_partes
UNION ALL SELECT 'ingresos_actuaciones',count(*) FROM public.ingresos_actuaciones
UNION ALL SELECT 'movimientos_ingresos',count(*) FROM public.movimientos_ingresos
UNION ALL SELECT 'archivos_relevos',count(*) FROM public.archivos_relevos
UNION ALL SELECT 'relevos_documentos',count(*) FROM public.relevos_documentos
UNION ALL SELECT 'movimientos_sustituciones',count(*) FROM public.movimientos_sustituciones
UNION ALL SELECT 'sustituciones_actuaciones',count(*) FROM public.sustituciones_actuaciones
UNION ALL SELECT 'auditoria_archivistica',count(*) FROM public.auditoria_archivistica;

SELECT conrelid::regclass::text AS tabla,conname,convalidated,pg_get_constraintdef(oid) AS definicion
FROM pg_constraint WHERE conname IN
 ('uq_movimiento_identidad_documento','fk_ingreso_recepcion_mismo_documento',
  'fk_ingreso_anterior_mismo_documento','ct_ai_archivo_responsable','ct_ai_asignacion_responsable')
 OR conrelid IN ('public.movimientos_ingresos'::regclass,'public.archivos_relevos'::regclass)
ORDER BY tabla,conname;

SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public'
 AND indexname IN ('uq_archivo_responsable_vigente','uq_ingreso_abierto_documento',
  'uq_sustitucion_intervencion_vigente','uq_movimiento_pendiente_documento') ORDER BY indexname;

-- Comparar con 000 tambien hashes/definiciones de funciones y triggers previos.
-- Esta consulta por si sola no acredita que no cambiaron datos preexistentes.
ROLLBACK;
