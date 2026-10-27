-- PREPARADO; NO EJECUTADO. Lectura previa a 001 y 002. No es una migracion.
-- Usar una conexion de mantenimiento al destino confirmado, nunca credenciales
-- publicadas en el comando. Verificar host fuera de SQL y rama/base aqui.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT current_database() AS base, current_user AS usuario,
       current_setting('server_version') AS version,
       current_setting('neon.branch_id', true) AS rama;

SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN
 ('documentos','movimientos_documentales','usuarios','oficinas','estantes',
  'archivadores','tipos_documentales','historial_modificaciones')
ORDER BY table_name, ordinal_position;

SELECT conrelid::regclass::text AS tabla, conname,
       pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
ORDER BY conrelid::regclass::text, conname;

SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' ORDER BY tablename, indexname;

SELECT c.relname AS tabla, t.tgname, t.tgenabled, t.tgdeferrable,
       t.tginitdeferred, pg_get_triggerdef(t.oid) AS definicion
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;

-- Solo definiciones, nunca hashes de contrasenas o contenido documental.
SELECT proname, pg_get_functiondef(oid) AS definicion FROM pg_proc
WHERE pronamespace = 'public'::regnamespace AND proname IN
 ('fn_documental_actor','fn_documentos_proteger_integridad',
  'fn_documental_validar_circulacion','fn_movimientos_proteger_historial',
  'fn_documentos_auditar','fn_movimientos_auditar','fn_auditoria_general',
  'fn_documentos_generar_codigo') ORDER BY proname;
ROLLBACK;
