-- Impide pertenencias incompatibles con rol y titularidad: ámbito compartido institucional o personal del
-- usuario.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.validar_miembro_ambito ()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  r smallint;
  c text;
  t bigint;
BEGIN
  SELECT
    rol_id
  INTO
    r
  FROM
    usuarios
  WHERE
    id = NEW.usuario_id;
  SELECT
    clase,
    titular_id
  INTO
    c,
    t
  FROM
    ambitos_registro
  WHERE
    id = NEW.ambito_id;
  IF ((c = 'COMPARTIDO_DIRECCION' AND r IN (3, 4)) OR (c = 'PERSONAL' AND r = 5 AND t = NEW.usuario_id)) IS
    DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Miembro incompatible con ámbito';
  END IF;
  RETURN NEW;
END
$$;
