-- Comprueba que el creador del tipo pertenece al ámbito indicado antes de guardar el catálogo.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.validar_tipo_documental ()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT
      1
    FROM
      miembros_ambito
    WHERE
      ambito_id = NEW.ambito_id
      AND usuario_id = NEW.creado_por) THEN
    RAISE EXCEPTION 'Tipo creado fuera del ámbito';
  END IF;
  RETURN NEW;
END
$$;
