BEGIN;
SET LOCAL search_path = public;

-- No guarda contenido documental ni bytes. El reloj y la fecha de anulación son de PostgreSQL.
CREATE TABLE public.pdf_retenciones_anulacion (
 documento_id bigint PRIMARY KEY REFERENCES public.documentos(id),
 revision uuid NOT NULL,
 clave_r2 text NOT NULL UNIQUE,
 anulado_en timestamptz NOT NULL,
 vence_en timestamptz GENERATED ALWAYS AS (((anulado_en AT TIME ZONE 'UTC') + interval '14 days') AT TIME ZONE 'UTC') STORED,
 reintentar_desde timestamptz NOT NULL DEFAULT clock_timestamp(),
 intentos integer NOT NULL DEFAULT 0 CHECK (intentos>=0),
 eliminado_en timestamptz,
 CHECK (eliminado_en IS NULL OR eliminado_en>=vence_en)
);
CREATE INDEX pdf_retenciones_pendientes ON public.pdf_retenciones_anulacion(vence_en,reintentar_desde)
 WHERE eliminado_en IS NULL;

CREATE FUNCTION public.programar_retencion_pdf_anulado() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public AS $$
DECLARE fecha_anulacion timestamptz;
BEGIN
 IF NEW.situacion='ANULADO' AND OLD.situacion<>'ANULADO' THEN
  SELECT fecha INTO STRICT fecha_anulacion FROM public.auditoria_documental
   WHERE documento_id=NEW.id AND accion='ANULACION' ORDER BY id DESC LIMIT 1;
  INSERT INTO public.pdf_retenciones_anulacion(documento_id,revision,clave_r2,anulado_en)
   SELECT documento_id,revision,clave_r2,fecha_anulacion FROM public.documentos_pdf WHERE documento_id=NEW.id;
 END IF;
 RETURN NULL;
END $$;
-- Se ejecuta después de auditar_documento: utiliza la misma fecha del evento de anulación.
CREATE TRIGGER z_programar_retencion_pdf AFTER UPDATE OF situacion ON public.documentos
 FOR EACH ROW EXECUTE FUNCTION public.programar_retencion_pdf_anulado();

-- Nunca inventar una fecha para anulaciones históricas sin constancia.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM documentos d JOIN documentos_pdf p ON p.documento_id=d.id
  WHERE d.situacion='ANULADO' AND NOT EXISTS(SELECT 1 FROM auditoria_documental h WHERE h.documento_id=d.id AND h.accion='ANULACION'))
 THEN RAISE EXCEPTION 'PDF anulado sin fecha de auditoría; requiere diagnóstico'; END IF;
END $$;
INSERT INTO public.pdf_retenciones_anulacion(documento_id,revision,clave_r2,anulado_en)
 SELECT p.documento_id,p.revision,p.clave_r2,(SELECT min(h.fecha) FROM public.auditoria_documental h
 WHERE h.documento_id=d.id AND h.accion='ANULACION') FROM public.documentos_pdf p
 JOIN public.documentos d ON d.id=p.documento_id WHERE d.situacion='ANULADO';

ALTER TABLE public.pdf_eventos DROP CONSTRAINT pdf_eventos_accion_check;
ALTER TABLE public.pdf_eventos ADD CONSTRAINT pdf_eventos_accion_check CHECK
 (accion IN ('CARGA','REEMPLAZO','ELIMINACION','LIMPIEZA_PENDIENTE','LIMPIEZA_COMPLETADA',
 'RETENCION_14_DIAS_PENDIENTE','RETENCION_14_DIAS_ELIMINADA'));

-- Única excepción para retirar metadatos de un anulado. No concede eliminación a ningún rol de usuario.
CREATE FUNCTION public.es_finalizacion_retencion(doc bigint,rev uuid,clave text) RETURNS boolean
 LANGUAGE sql STABLE SET search_path = pg_catalog,public AS $$
 SELECT current_setting('app.finalizar_retencion',true)='on'
 AND current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.pdf_retenciones_anulacion'::regclass))
 AND EXISTS(SELECT 1 FROM public.pdf_retenciones_anulacion r JOIN public.documentos d ON d.id=r.documento_id
 WHERE r.documento_id=doc AND r.revision=rev AND r.clave_r2=clave AND d.situacion='ANULADO'
 AND r.vence_en<=clock_timestamp() AND r.eliminado_en IS NULL)
$$;

CREATE FUNCTION public.finalizar_retencion_pdf(doc bigint,rev uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public AS $$
DECLARE r public.pdf_retenciones_anulacion%ROWTYPE;
BEGIN
 PERFORM 1 FROM public.documentos WHERE id=doc AND situacion='ANULADO' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento no anulado'; END IF;
 SELECT * INTO STRICT r FROM public.pdf_retenciones_anulacion WHERE documento_id=doc FOR UPDATE;
 IF r.revision<>rev OR r.vence_en>clock_timestamp() THEN RAISE EXCEPTION 'Retención no vencida o revisión incompatible'; END IF;
 IF r.eliminado_en IS NOT NULL THEN RETURN; END IF;
 PERFORM set_config('app.finalizar_retencion','on',true);
 DELETE FROM public.documentos_pdf WHERE documento_id=doc AND revision=rev AND clave_r2=r.clave_r2;
 IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo PDF incompatible'; END IF;
 PERFORM set_config('app.finalizar_retencion','off',true);
 UPDATE public.pdf_retenciones_anulacion SET eliminado_en=clock_timestamp(),intentos=intentos+1 WHERE documento_id=doc;
 UPDATE public.pdf_objetos_pendientes SET eliminado_en=clock_timestamp() WHERE clave_r2=r.clave_r2;
 INSERT INTO public.pdf_eventos(documento_id,accion,revision) VALUES(doc,'RETENCION_14_DIAS_ELIMINADA',rev);
END $$;
REVOKE ALL ON FUNCTION public.finalizar_retencion_pdf(bigint,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.programar_retencion_pdf_anulado() FROM PUBLIC;
REVOKE ALL ON TABLE public.pdf_retenciones_anulacion FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sistema_web_app') THEN
  GRANT SELECT ON public.pdf_retenciones_anulacion TO sistema_web_app;
  GRANT UPDATE(intentos,reintentar_desde) ON public.pdf_retenciones_anulacion TO sistema_web_app;
  GRANT EXECUTE ON FUNCTION public.finalizar_retencion_pdf(bigint,uuid) TO sistema_web_app;
 END IF;
END $$;

-- Estas dos funciones conservan todas sus comprobaciones, salvo la finalización interna anterior.
DO $migration$
DECLARE definicion text;
BEGIN
 SELECT pg_get_functiondef('public.validar_pdf_permiso()'::regprocedure) INTO definicion;
 definicion:=replace(definicion,'BEGIN',E'BEGIN\n  IF TG_OP=''DELETE'' THEN\n    IF public.es_finalizacion_retencion(OLD.documento_id,OLD.revision,OLD.clave_r2) THEN RETURN OLD; END IF;\n  END IF;');
 EXECUTE definicion;
 SELECT pg_get_functiondef('public.auditar_pdf()'::regprocedure) INTO definicion;
 definicion:=replace(definicion,'BEGIN',E'BEGIN\n  IF TG_OP=''DELETE'' THEN\n    IF public.es_finalizacion_retencion(OLD.documento_id,OLD.revision,OLD.clave_r2) THEN RETURN NULL; END IF;\n  END IF;');
 EXECUTE definicion;
END $migration$;
COMMIT;
