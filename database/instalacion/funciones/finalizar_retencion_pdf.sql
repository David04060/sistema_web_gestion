-- Finaliza una retención identificada por documento y revisión después de la eliminación externa; registra su
-- evento técnico.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.finalizar_retencion_pdf (doc bigint, rev uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
  AS $$
DECLARE
  r public.pdf_retenciones_anulacion%ROWTYPE;
BEGIN
  PERFORM
    1
  FROM
    public.documentos
  WHERE
    id = doc
    AND situacion = 'ANULADO'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento no anulado';
  END IF;
  SELECT
    *
  INTO
    STRICT r
  FROM
    public.pdf_retenciones_anulacion
  WHERE
    documento_id = doc
  FOR UPDATE;
  IF r.revision <> rev OR r.vence_en > clock_timestamp() THEN
    RAISE EXCEPTION 'Retención no vencida o revisión incompatible';
  END IF;
  IF r.eliminado_en IS NOT NULL THEN
    RETURN;
  END IF;
  PERFORM
    set_config('app.finalizar_retencion', 'on', true);
  DELETE FROM public.documentos_pdf
  WHERE documento_id = doc
    AND revision = rev
    AND clave_r2 = r.clave_r2;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vínculo PDF incompatible';
  END IF;
  PERFORM
    set_config('app.finalizar_retencion', 'off', true);
  UPDATE
    public.pdf_retenciones_anulacion
  SET
    eliminado_en = clock_timestamp(),
    intentos = intentos + 1
  WHERE
    documento_id = doc;
  UPDATE
    public.pdf_objetos_pendientes
  SET
    eliminado_en = clock_timestamp()
  WHERE
    clave_r2 = r.clave_r2;
  INSERT INTO public.pdf_eventos (documento_id, accion, revision)
    VALUES (doc, 'RETENCION_14_DIAS_ELIMINADA', rev);
END
$$;
