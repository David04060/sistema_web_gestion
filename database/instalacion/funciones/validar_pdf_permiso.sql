-- Comprueba actor, alcance y situación en INSERT/UPDATE/DELETE de metadatos PDF, incluida la excepción de
-- mantenimiento.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.validar_pdf_permiso ()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  doc bigint;
  actor bigint;
  rol smallint;
  d documentos%ROWTYPE;
  amb text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.es_finalizacion_retencion (OLD.documento_id, OLD.revision, OLD.clave_r2) THEN
      RETURN OLD;
    END IF;
  END IF;
  doc := CASE WHEN TG_OP = 'DELETE' THEN
    OLD.documento_id
  ELSE
    NEW.documento_id
  END;
  actor := nullif (current_setting('app.actor_id', true), '')::bigint;
  SELECT
    rol_id
  INTO
    rol
  FROM
    usuarios
  WHERE
    id = actor
    AND activo;
  SELECT
    *
  INTO
    d
  FROM
    documentos
  WHERE
    id = doc
  FOR UPDATE;
  SELECT
    clase
  INTO
    amb
  FROM
    ambitos_registro
  WHERE
    id = d.ambito_id;
  IF d.id IS NULL OR d.situacion = 'ANULADO' OR ((amb = 'COMPARTIDO_DIRECCION' AND rol IN (3, 4)) OR (actor =
    d.registrado_por AND rol IN (3, 4, 5) AND TG_OP <> 'DELETE') OR (amb = 'PERSONAL' AND rol = 5
    AND actor = d.registrado_por AND d.situacion <> 'DELEGADO')) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Operación PDF no autorizada';
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.actualizado_por IS DISTINCT FROM actor THEN
    RAISE EXCEPTION 'Actor PDF incompatible';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.documento_id <> OLD.documento_id THEN
    RAISE EXCEPTION 'Documento PDF inmutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;
