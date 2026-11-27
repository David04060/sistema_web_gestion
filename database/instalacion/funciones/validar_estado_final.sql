-- Trigger diferido: comprueba al confirmar que situación y hechos de delegación/ubicación sean coherentes.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.validar_estado_final ()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  actual text;
  n integer;
BEGIN
  SELECT
    situacion
  INTO
    actual
  FROM
    documentos
  WHERE
    id = NEW.id;
  IF actual = 'DELEGADO' THEN
    SELECT
      count(*)
    INTO
      n
    FROM
      delegaciones_documento
    WHERE
      documento_id = NEW.id;
    IF n < 1 THEN
      RAISE EXCEPTION 'Delegación sin hecho asociado';
    END IF;
  ELSIF actual = 'GUARDADO_DIRECCION' THEN
    SELECT
      count(*)
    INTO
      n
    FROM
      ubicaciones_documento u
      JOIN unidades_ubicacion lugar ON lugar.id = u.unidad_id
      JOIN usuarios propietario ON propietario.id = lugar.propietario_id
    WHERE
      u.documento_id = NEW.id
      AND u.vigente
      AND propietario.rol_id = 3;
    IF n < 1 THEN
      RAISE EXCEPTION 'Guardado en Dirección sin ubicación';
    END IF;
  END IF;
  RETURN NULL;
END
$$;
