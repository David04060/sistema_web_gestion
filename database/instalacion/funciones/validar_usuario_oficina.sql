-- Exige oficina compatible con rol y actividad; permite conservar asignación anterior a una oficina inactiva.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.validar_usuario_oficina ()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  o text;
BEGIN
  IF NEW.oficina_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.oficina_id IS DISTINCT FROM
    OLD.oficina_id) AND NOT EXISTS (
  SELECT
    1
  FROM
    public.oficinas
  WHERE
    id = NEW.oficina_id
      AND activa) THEN
    RAISE EXCEPTION 'Una oficina inactiva no admite nuevas asignaciones';
  END IF;
  IF NEW.rol_id = 3 AND NEW.oficina_id IS NOT NULL THEN
    SELECT
      nombre
    INTO
      o
    FROM
      oficinas
    WHERE
      id = NEW.oficina_id;
    IF o IS DISTINCT FROM 'Dirección' THEN
      RAISE EXCEPTION 'Dirección requiere su oficina';
    END IF;
  ELSIF NEW.rol_id = 4
      AND NEW.oficina_id IS NOT NULL THEN
      SELECT
        nombre
      INTO
        o
      FROM
        oficinas
      WHERE
        id = NEW.oficina_id;
    IF o IS DISTINCT FROM 'Mesa de Partes' THEN
      RAISE EXCEPTION 'Secretaría requiere Mesa de Partes';
    END IF;
  ELSIF NEW.rol_id IN (1, 2)
      AND NEW.oficina_id IS NOT NULL THEN
      RAISE EXCEPTION 'Cuenta administrativa sin oficina documental';
  END IF;
  IF NEW.rol_id = 5 AND EXISTS (
    SELECT
      1
    FROM
      oficinas
    WHERE
      id = NEW.oficina_id
      AND nombre IN ('Dirección', 'Mesa de Partes')) THEN
    RAISE EXCEPTION 'Usuario no puede asignarse a Dirección ni Mesa de Partes';
  END IF;
  NEW.actualizada_en := clock_timestamp();
  RETURN NEW;
END
$$;

SET default_tablespace = '';

SET default_table_access_method = heap;
