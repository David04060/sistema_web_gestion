-- DOCUMENTACIÓN del esquema de atención del 26/11/2026; no ejecutar por separado.
SET LOCAL search_path TO public,pg_catalog;
-- Acciones independientes: sin estados de atención, sin oficina obligatoria ni límite de cantidad.
CREATE TABLE public.acciones_documento (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 documento_id bigint NOT NULL REFERENCES public.documentos(id),
 responsable_id bigint NOT NULL REFERENCES public.usuarios(id),
 oficina_id bigint REFERENCES public.oficinas(id),
 oficina_nombre text,
 descripcion text NOT NULL CHECK(length(btrim(descripcion)) BETWEEN 1 AND 20000),
 creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 actualizado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 pdf_clave text UNIQUE,
 pdf_nombre text,
 pdf_tamano integer,
 CHECK ((pdf_clave IS NULL AND pdf_nombre IS NULL AND pdf_tamano IS NULL) OR
 (pdf_clave IS NOT NULL AND pdf_nombre IS NOT NULL AND pdf_tamano BETWEEN 1 AND 15728640))
);
CREATE INDEX acciones_documento_recorrido ON public.acciones_documento(documento_id,creado_en,id);
-- Intenciones durables; las claves finales nunca se exponen mediante URL de carga.
CREATE TABLE public.acciones_pdf_cargas (
 id uuid PRIMARY KEY,
 documento_id bigint NOT NULL REFERENCES public.documentos(id),
 actor_id bigint NOT NULL REFERENCES public.usuarios(id),
 temporal text NOT NULL UNIQUE,
 definitiva text NOT NULL UNIQUE,
 nombre text NOT NULL,
 tamano integer NOT NULL CHECK(tamano BETWEEN 1 AND 15728640),
 vence_en timestamptz NOT NULL,
 accion_id bigint REFERENCES public.acciones_documento(id),
 confirmada_en timestamptz
);
CREATE INDEX acciones_pdf_cargas_pendientes ON public.acciones_pdf_cargas(actor_id,vence_en) WHERE confirmada_en IS NULL;

-- El autor y su oficina se obtienen en PostgreSQL; una corrección mantiene la identidad original.
CREATE FUNCTION public.validar_accion_documental() RETURNS trigger LANGUAGE plpgsql SET search_path TO pg_catalog,public AS $$
DECLARE actor bigint; d documentos%ROWTYPE; u usuarios%ROWTYPE;
BEGIN
 actor:=nullif(current_setting('app.actor_id',true),'')::bigint;
 SELECT * INTO d FROM documentos WHERE id=NEW.documento_id FOR UPDATE;
 SELECT * INTO u FROM usuarios WHERE id=actor AND activo;
 IF d.id IS NULL OR d.situacion='ANULADO' OR documento_periodo_cerrado(d.id)
 OR u.id IS NULL OR documento_delegado_por(actor,d.id) IS NULL THEN
  RAISE EXCEPTION 'Acción documental no autorizada' USING ERRCODE='42501';
 END IF;
 IF TG_OP='INSERT' THEN
  NEW.responsable_id:=actor; NEW.oficina_id:=u.oficina_id;
  SELECT nombre INTO NEW.oficina_nombre FROM oficinas WHERE id=u.oficina_id;
  NEW.creado_en:=clock_timestamp(); NEW.actualizado_en:=NEW.creado_en; NEW.revision:=1;
 ELSE
  IF OLD.responsable_id<>actor OR (NEW.id,NEW.documento_id,NEW.responsable_id,NEW.oficina_id,NEW.oficina_nombre,NEW.creado_en)
   IS DISTINCT FROM (OLD.id,OLD.documento_id,OLD.responsable_id,OLD.oficina_id,OLD.oficina_nombre,OLD.creado_en) THEN
   RAISE EXCEPTION 'Solo el autor corrige su acción sin alterar su identidad' USING ERRCODE='42501';
  END IF;
  NEW.revision:=OLD.revision+1; NEW.actualizado_en:=clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validar_accion_documental BEFORE INSERT OR UPDATE ON acciones_documento FOR EACH ROW EXECUTE FUNCTION validar_accion_documental();

-- La corrección actualiza la misma acción y registra el antes/después en la auditoría existente.
CREATE FUNCTION public.auditar_accion_documental() RETURNS trigger LANGUAGE plpgsql SET search_path TO pg_catalog,public AS $$
DECLARE antes jsonb; despues jsonb;
BEGIN
 IF TG_OP='UPDATE' THEN
  antes:=jsonb_build_object('accion_id',OLD.id::text,'descripcion',OLD.descripcion,'pdf_nombre',OLD.pdf_nombre);
  IF OLD.pdf_clave IS DISTINCT FROM NEW.pdf_clave AND OLD.pdf_clave IS NOT NULL THEN
   INSERT INTO pdf_objetos_pendientes(clave_r2,documento_id,limpiar_desde) VALUES(OLD.pdf_clave,OLD.documento_id,clock_timestamp())
   ON CONFLICT(clave_r2) DO UPDATE SET limpiar_desde=clock_timestamp();
  END IF;
 END IF;
 despues:=jsonb_build_object('accion_id',NEW.id::text,'descripcion',NEW.descripcion,'pdf_nombre',NEW.pdf_nombre);
 INSERT INTO auditoria_documental(documento_id,actor_id,accion,motivo,anterior,posterior)
 VALUES(NEW.documento_id,NEW.responsable_id,CASE WHEN TG_OP='INSERT' THEN 'ACCION_REGISTRADA' ELSE 'ACCION_CORREGIDA' END,
 current_setting('app.motivo',true),antes,despues);
 RETURN NULL;
END $$;
CREATE TRIGGER auditar_accion_documental AFTER INSERT OR UPDATE ON acciones_documento FOR EACH ROW EXECUTE FUNCTION auditar_accion_documental();
CREATE TRIGGER proteger_acciones BEFORE DELETE ON acciones_documento FOR EACH ROW EXECUTE FUNCTION impedir_cambio_historico();
CREATE TRIGGER no_truncar_acciones BEFORE TRUNCATE ON acciones_documento EXECUTE FUNCTION impedir_truncado();
