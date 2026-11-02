-- Primera modificación sobre 33a52f4: clasificación del registro, no de circulación.
-- Solo desarrollo local, destino identificado por nombre, servidor y OID.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtext('administracion-institucional'));
DO $guarda$
BEGIN
 IF current_database() !~ '^sistema_web_final_qa_clasif_[a-f0-9]{32}$'
 OR inet_server_addr()::text NOT IN ('127.0.0.1/32','::1/128')
 OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL
 OR (SELECT oid::text FROM pg_database WHERE datname=current_database())
    IS DISTINCT FROM current_setting('app.clasificacion_destino_oid',true) THEN
  RAISE EXCEPTION 'La migración requiere la copia de desarrollo identificada';
 END IF;
 IF to_regclass('public.archivos_institucionales') IS NOT NULL
 OR EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documentos' AND column_name='clasificacion_registro') THEN
  RAISE EXCEPTION 'El esquema no corresponde a la versión recuperada sin esta migración';
 END IF;
END;
$guarda$;
ALTER TABLE public.documentos ADD COLUMN clasificacion_registro text;
ALTER TABLE public.documentos ADD CONSTRAINT ck_documentos_clasificacion_registro
 CHECK(clasificacion_registro IS NULL OR clasificacion_registro IN ('RECIBIDO','EMITIDO'));
COMMENT ON COLUMN public.documentos.clasificacion_registro IS
 'Clasificación de registro independiente del tipo y circulación. NULL conserva antecedentes sin clasificar.';
CREATE FUNCTION public.fn_documentos_clasificacion_registro() RETURNS trigger
 LANGUAGE plpgsql AS $funcion$
BEGIN
 IF TG_OP='INSERT' AND NEW.clasificacion_registro IS NULL THEN
  RAISE EXCEPTION 'La clasificación es obligatoria en registros nuevos' USING ERRCODE='23514';
 ELSIF TG_OP='UPDATE' AND NEW.clasificacion_registro IS DISTINCT FROM OLD.clasificacion_registro THEN
  RAISE EXCEPTION 'Esta fase no permite reclasificar registros anteriores' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$funcion$;
CREATE TRIGGER aa_documentos_clasificacion_registro
 BEFORE INSERT OR UPDATE OF clasificacion_registro ON public.documentos
 FOR EACH ROW EXECUTE FUNCTION public.fn_documentos_clasificacion_registro();
-- Sin UPDATE de filas: no se inventan clasificaciones ni se consume un correlativo.
COMMIT;
