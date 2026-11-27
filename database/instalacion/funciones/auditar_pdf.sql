-- Registra eventos y auditoría PDF y encola objetos sustituidos para limpieza; no almacena binarios.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.auditar_pdf ()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  actor bigint;
  accion text;
  doc bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.es_finalizacion_retencion (OLD.documento_id, OLD.revision, OLD.clave_r2) THEN
      RETURN NULL;
    END IF;
  END IF;
  actor := nullif (current_setting('app.actor_id', true), '')::bigint;
  doc := CASE WHEN TG_OP = 'DELETE' THEN
    OLD.documento_id
  ELSE
    NEW.documento_id
  END;
  accion := CASE TG_OP
  WHEN 'INSERT' THEN
    'CARGA'
  WHEN 'UPDATE' THEN
    'REEMPLAZO'
  ELSE
    'ELIMINACION'
  END;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    INSERT INTO pdf_objetos_pendientes (clave_r2, documento_id, limpiar_desde)
      VALUES (OLD.clave_r2, doc, clock_timestamp())
    ON CONFLICT (clave_r2)
      DO UPDATE SET
        limpiar_desde = least (pdf_objetos_pendientes.limpiar_desde, EXCLUDED.limpiar_desde),
        eliminado_en = NULL;
  END IF;
  INSERT INTO pdf_eventos (documento_id, actor_id, accion, revision)
    VALUES (doc, actor, accion, CASE WHEN TG_OP = 'DELETE' THEN
        OLD.revision
      ELSE
        NEW.revision
      END);
  INSERT INTO auditoria_documental (documento_id, actor_id, accion, anterior, posterior)
    VALUES (doc, actor, 'PDF_' || accion, CASE WHEN TG_OP = 'INSERT' THEN
        NULL
      ELSE
        to_jsonb (OLD) - 'clave_r2'
      END, CASE WHEN TG_OP = 'DELETE' THEN
        NULL
      ELSE
        to_jsonb (NEW) - 'clave_r2'
      END);
  RETURN NULL;
END
$$;
