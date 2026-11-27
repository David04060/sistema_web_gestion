-- Registra alta o cambios de contenido/situación con actor y motivo de la transacción, preservando antes y
-- después.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.auditar_documento ()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  actor bigint;
  accion text;
  motivo text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO auditoria_documental (documento_id, actor_id, accion, posterior)
      VALUES (NEW.id, NEW.registrado_por, 'REGISTRO', to_jsonb (NEW));
  ELSE
    actor := nullif (current_setting('app.actor_id', true), '')::bigint;
    motivo := current_setting('app.motivo', true);
    IF NEW.situacion = 'ANULADO' AND OLD.situacion <> 'ANULADO' THEN
      accion := 'ANULACION';
    ELSIF (NEW.asunto,
        NEW.remitente,
        NEW.observaciones) IS DISTINCT FROM (OLD.asunto,
        OLD.remitente,
        OLD.observaciones) THEN
      accion := 'CORRECCION';
    ELSE
      RETURN NULL;
    END IF;
    INSERT INTO auditoria_documental (documento_id, actor_id, accion, motivo, anterior, posterior)
      VALUES (NEW.id, actor, accion, motivo, to_jsonb (OLD), to_jsonb (NEW));
  END IF;
  RETURN NULL;
END
$$;
