-- Clasificación aprobada. Sin reclasificar antecedentes. Ejecutar con migrar-local.mjs.
DO $guarda$
BEGIN
 IF current_database()<>'sistema_web_final'
 OR inet_server_addr()::text NOT IN ('127.0.0.1/32','::1/128')
 OR current_schema()<>'public'
 OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL
 OR to_regclass('public.archivos_institucionales') IS NOT NULL THEN
  RAISE EXCEPTION 'La migración requiere sistema_web_final local, esquema public y sin integración descartada';
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
