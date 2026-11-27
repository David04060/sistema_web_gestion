-- Valida origen y nuevo documento, acceso y ausencia de autorreferencias/ciclos antes de crear la relación.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.validar_relacion ()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog', 'public'
  AS $$
DECLARE
  hijo public.documentos%ROWTYPE;
  actor bigint;
BEGIN
  actor := nullif (current_setting('app.actor_id', true), '')::bigint;
  SELECT
    *
  INTO
    hijo
  FROM
    public.documentos
  WHERE
    id = NEW.documento_id FOR SHARE;
  PERFORM
    1
  FROM
    public.documentos
  WHERE
    id = NEW.origen_id FOR SHARE;
  IF hijo.id IS NULL OR actor IS DISTINCT FROM NEW.creado_por OR hijo.registrado_por IS DISTINCT FROM actor
    OR hijo.situacion = 'ANULADO' OR public.documento_periodo_cerrado (hijo.id) OR NOT
    (EXISTS(SELECT 1 FROM documentos origen WHERE origen.id=NEW.origen_id AND origen.registrado_por=actor) OR public.documento_delegado_por(actor,NEW.origen_id) IS NOT NULL) OR EXISTS (
    SELECT
      1
    FROM
      public.documentos
    WHERE
      id = NEW.origen_id
      AND situacion = 'ANULADO') THEN
    RAISE EXCEPTION 'Origen no consultable o autor incompatible';
  END IF;
  IF NEW.documento_id = NEW.origen_id OR EXISTS ( WITH RECURSIVE cadena (
      id
    ) AS (
    SELECT
      NEW.origen_id
    UNION
    SELECT
      r.origen_id
    FROM
      public.documentos_relaciones r
      JOIN cadena c ON r.documento_id = c.id
    )
    SELECT
      1
    FROM
      cadena
    WHERE
      id = NEW.documento_id) THEN
    RAISE EXCEPTION 'Ciclo documental';
  END IF;
  RETURN NEW;
END
$$;
