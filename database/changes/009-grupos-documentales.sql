BEGIN;
SET LOCAL search_path=public;

-- UNION elimina nodos repetidos y termina incluso ante una cadena histórica malformada.
CREATE FUNCTION public.documentos_grupo(doc bigint) RETURNS TABLE(id bigint)
 LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 WITH RECURSIVE grupo(id) AS (
  SELECT doc
  UNION
  SELECT CASE WHEN r.documento_id=g.id THEN r.origen_id ELSE r.documento_id END
  FROM grupo g JOIN public.documentos_relaciones r ON r.documento_id=g.id OR r.origen_id=g.id
 ) SELECT id FROM grupo
$$;
CREATE INDEX documentos_relaciones_origen ON public.documentos_relaciones(origen_id);

CREATE FUNCTION public.documento_tiene_relacion_visible(actor bigint,doc bigint) RETURNS boolean
 LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.documentos_grupo(doc) g WHERE g.id<>doc
  AND public.documento_consultable(actor,g.id))
$$;

CREATE OR REPLACE FUNCTION public.validar_relacion() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE hijo public.documentos%ROWTYPE; actor bigint;
BEGIN
 actor:=nullif(current_setting('app.actor_id',true),'')::bigint;
 SELECT * INTO hijo FROM public.documentos WHERE id=NEW.documento_id FOR SHARE;
 PERFORM 1 FROM public.documentos WHERE id=NEW.origen_id FOR SHARE;
 IF hijo.id IS NULL OR actor IS DISTINCT FROM NEW.creado_por OR hijo.registrado_por IS DISTINCT FROM actor
  OR hijo.situacion='ANULADO' OR public.documento_periodo_cerrado(hijo.id)
  OR NOT public.documento_consultable(actor,NEW.origen_id)
  OR EXISTS(SELECT 1 FROM public.documentos WHERE id=NEW.origen_id AND situacion='ANULADO') THEN
  RAISE EXCEPTION 'Origen no consultable o autor incompatible';
 END IF;
 IF NEW.documento_id=NEW.origen_id OR EXISTS(
  WITH RECURSIVE cadena(id) AS (
   SELECT NEW.origen_id UNION SELECT r.origen_id FROM public.documentos_relaciones r JOIN cadena c ON r.documento_id=c.id
  ) SELECT 1 FROM cadena WHERE id=NEW.documento_id
 ) THEN RAISE EXCEPTION 'Ciclo documental'; END IF;
 RETURN NEW;
END $$;
COMMIT;
