-- Antes del alta, valida tipo y ámbito y reserva correlativo por año bajo bloqueo; devuelve NEW con código
-- visible.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.asignar_codigo_documental ()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  p text;
  tn text;
  rol smallint;
  amb text;
  n bigint;
BEGIN
  SELECT
    prefijo,
    nombre
  INTO
    p,
    tn
  FROM
    tipos_documentales
  WHERE
    id = NEW.tipo_id
    AND ambito_id = NEW.ambito_id
    AND activo FOR SHARE;
  IF p IS NULL THEN
    RAISE EXCEPTION 'Tipo documental no disponible';
  END IF;
  SELECT
    rol_id
  INTO
    rol
  FROM
    usuarios
  WHERE
    id = NEW.registrado_por;
  SELECT
    clase
  INTO
    amb
  FROM
    ambitos_registro
  WHERE
    id = NEW.ambito_id;
  IF ((rol = 5 AND amb = 'PERSONAL' AND NEW.situacion = 'PERSONAL') OR (rol = 3 AND amb =
    'COMPARTIDO_DIRECCION' AND NEW.situacion = 'PENDIENTE_DIRECCION') OR (rol = 4 AND amb =
    'COMPARTIDO_DIRECCION' AND NEW.situacion
    IN ('PENDIENTE_DIRECCION', 'EN_MESA_DE_PARTES'))) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Situación inicial incompatible';
  END IF;
  NEW.anio := extract(year from clock_timestamp())::integer;
  INSERT INTO correlativos_documentales (ambito_id, tipo_id, anio, ultimo_numero)
    VALUES (NEW.ambito_id, NEW.tipo_id, NEW.anio, 1)
  ON CONFLICT (ambito_id, tipo_id, anio)
    DO UPDATE SET
      ultimo_numero = correlativos_documentales.ultimo_numero + 1
    RETURNING
      ultimo_numero
    INTO
      n;
  NEW.correlativo := n;
  NEW.prefijo_guardado := p;
  NEW.tipo_nombre_guardado := tn;
  NEW.codigo_visible := p || NEW.anio::text || CASE WHEN n >= 1000 THEN
    n::text
  ELSE
    lpad(n::text, 3, '0')
  END;
  RETURN NEW;
END
$$;
