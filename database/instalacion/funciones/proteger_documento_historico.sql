-- Rechaza cambios documentales/PDF sobre periodos cerrados, salvo la finalización interna de retención
-- autorizada.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.proteger_documento_historico ()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog', 'public'
  AS $$
DECLARE
  doc bigint;
BEGIN
  IF TG_TABLE_NAME = 'documentos' THEN
    doc := OLD.id;
  ELSIF TG_OP = 'DELETE' THEN
    doc := OLD.documento_id;
  ELSE
    IF TG_OP = 'UPDATE' THEN
      IF public.documento_periodo_cerrado (OLD.documento_id) THEN
        RAISE EXCEPTION 'Documento histórico: solo lectura'
          USING ERRCODE = '42501';
      END IF;
    END IF;
    doc := NEW.documento_id;
  END IF;
  IF EXISTS (
    SELECT
      1
    FROM
      public.usuarios
    WHERE
      id = nullif (current_setting('app.actor_id', true), '')::bigint
      AND rol_id IN (3, 4)
      AND oficina_id IS NULL) THEN
    RAISE EXCEPTION 'Cuenta institucional sin asignación'
      USING ERRCODE = '42501';
  END IF;
  IF public.documento_periodo_cerrado (doc) THEN
    IF TG_TABLE_NAME = 'documentos_pdf' AND TG_OP = 'DELETE' THEN
      IF public.es_finalizacion_retencion (OLD.documento_id, OLD.revision, OLD.clave_r2) THEN
        RETURN OLD;
      END IF;
    END IF;
    RAISE EXCEPTION 'Documento de un periodo anterior: solo lectura'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;
