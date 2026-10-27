-- Privilegios operativos y validación posterior. Activación separada y explícita.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtext('administracion-institucional'));
DO $destino$
BEGIN
 IF current_setting('application_name')<>'documental-migracion-20261026'
 OR current_database() IS DISTINCT FROM nullif(current_setting('app.actualizacion_base_esperada',true),'')
 OR (SELECT oid::text FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM current_setting('app.actualizacion_oid_esperado',true) THEN
 RAISE EXCEPTION 'Identidad de destino de actualización no confirmada'; END IF;
 IF current_setting('app.actualizacion_modo',true)='produccion' THEN
  IF current_database()<>'neondb' OR nullif(current_setting('neon.branch_id',true),'') IS NULL
   OR current_setting('neon.branch_id',true) IS DISTINCT FROM current_setting('app.actualizacion_rama_esperada',true) THEN
   RAISE EXCEPTION 'Rama de producción distinta de la autorizada'; END IF;
 ELSIF current_setting('app.actualizacion_modo',true)='ensayo-local' THEN
  IF current_database() !~ '^sistema_web_final_qa_archivo_[a-f0-9]{32}$'
   OR inet_server_addr() NOT IN ('127.0.0.1'::inet,'::1'::inet) OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL THEN
   RAISE EXCEPTION 'Restauración de ensayo no confirmada'; END IF;
 ELSE RAISE EXCEPTION 'Modo de actualización no autorizado'; END IF;
END;
$destino$;
-- Conexión operativa separada del propietario de mantenimiento. No altera contraseñas.
DO $rol$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sistema_web_app' AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls) THEN
 RAISE EXCEPTION 'El rol operativo no cumple mínimos'; END IF;
END;
$rol$;
GRANT USAGE ON SCHEMA public TO sistema_web_app;
REVOKE CREATE ON SCHEMA public FROM sistema_web_app;
DO $minimos$
DECLARE t text; seq text;
BEGIN
 FOREACH t IN ARRAY ARRAY['usuarios','roles','oficinas','tipos_documentales','estantes','archivadores','documentos','movimientos_documentales',
 'claves_tipos_documentales','autorizaciones_tipos_restringidos','correlativos_documentales'] LOOP
 EXECUTE format('REVOKE ALL ON TABLE public.%I FROM sistema_web_app',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON TABLE public.%I TO sistema_web_app',t);
 END LOOP;
 REVOKE ALL ON historial_modificaciones FROM sistema_web_app;
 GRANT SELECT,INSERT ON historial_modificaciones TO sistema_web_app;
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
 EXECUTE format('REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.%I FROM sistema_web_app',t);
 END LOOP;
 FOR seq IN SELECT sequencename FROM pg_sequences WHERE schemaname='public' LOOP
 EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM sistema_web_app',seq);
 EXECUTE format('GRANT USAGE ON SEQUENCE public.%I TO sistema_web_app',seq);
 END LOOP;
END;
$minimos$;
DO $validar$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated)
 OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid WHERE c.relnamespace='public'::regnamespace AND NOT i.indisvalid)
 OR (SELECT count(*) FROM pg_trigger WHERE tgname IN ('ct_mp_ingreso_final','ct_mp_presentacion_contexto','ct_ai_entrega_custodia','ct_ai_sustitucion_actuada','ct_documento_circulacion','ct_movimiento_circulacion') AND tgdeferrable AND tginitdeferred)<>6 THEN
 RAISE EXCEPTION 'La verificación posterior de protecciones no pasó'; END IF;
END;
$validar$;
COMMIT;
