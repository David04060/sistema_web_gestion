-- Al anular, registra revisión y clave con su vencimiento de retención; no borra inmediatamente R2.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.programar_retencion_pdf_anulado ()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
  AS $$
DECLARE
  fecha_anulacion timestamptz;
BEGIN
  IF NEW.situacion = 'ANULADO' AND OLD.situacion <> 'ANULADO' THEN
    SELECT
      fecha
    INTO
      STRICT fecha_anulacion
    FROM
      public.auditoria_documental
    WHERE
      documento_id = NEW.id
      AND accion = 'ANULACION'
    ORDER BY
      id DESC
    LIMIT 1;
    INSERT INTO public.pdf_retenciones_anulacion (documento_id, revision, clave_r2, anulado_en)
    SELECT
      documento_id,
      revision,
      clave_r2,
      fecha_anulacion
    FROM
      public.documentos_pdf
    WHERE
      documento_id = NEW.id;
  END IF;
  RETURN NULL;
END
$$;
