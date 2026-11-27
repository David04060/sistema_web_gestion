-- Reconoce el contexto interno de finalización de una revisión PDF; evita confundir mantenimiento con edición
-- documental.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.es_finalizacion_retencion (doc bigint, rev uuid, clave text)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO 'pg_catalog', 'public'
  AS $$
  SELECT
    current_setting('app.finalizar_retencion', true) = 'on'
    AND current_user = pg_get_userbyid((
      SELECT
        relowner
      FROM pg_class
      WHERE
        oid = 'public.pdf_retenciones_anulacion'::regclass))
    AND EXISTS (
      SELECT
        1
      FROM
        public.pdf_retenciones_anulacion r
        JOIN public.documentos d ON d.id = r.documento_id
      WHERE
        r.documento_id = doc
        AND r.revision = rev
        AND r.clave_r2 = clave
        AND d.situacion = 'ANULADO'
        AND r.vence_en <= clock_timestamp()
        AND r.eliminado_en IS NULL)
$$;
