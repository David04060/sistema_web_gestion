-- Instalación trazable, sin datos ficticios ni cambios en registros existentes.
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
CREATE TABLE public.migraciones_archivisticas(id text PRIMARY KEY,sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),version_release text NOT NULL,
 aplicada_en timestamptz NOT NULL DEFAULT clock_timestamp(),ejecutada_por text NOT NULL DEFAULT current_user,origen text NOT NULL);
CREATE TABLE public.capacidades_archivisticas(version text PRIMARY KEY,activada boolean NOT NULL DEFAULT false,activada_en timestamptz,activada_por text);
INSERT INTO capacidades_archivisticas(version) VALUES('20261026-archivo-v1');
REVOKE ALL ON migraciones_archivisticas,capacidades_archivisticas FROM PUBLIC,sistema_web_app;
GRANT SELECT ON migraciones_archivisticas,capacidades_archivisticas TO sistema_web_app;
COMMIT;
