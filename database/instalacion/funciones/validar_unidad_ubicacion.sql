-- Valida dueño y padre de una unidad; rechaza padres ajenos y ciclos en el árbol.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.validar_unidad_ubicacion ()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  ciclo boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id,
    NEW.propietario_id,
    NEW.oficina_id) IS DISTINCT FROM (OLD.id,
  OLD.propietario_id,
  OLD.oficina_id) THEN
    RAISE EXCEPTION 'La identidad y propiedad de una ubicación no cambian';
  END IF;
  IF NEW.padre_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT
        1
      FROM
        unidades_ubicacion
      WHERE
        id = NEW.padre_id
        AND propietario_id = NEW.propietario_id
        AND activo) THEN
      RAISE EXCEPTION 'La ubicación contenedora debe existir, estar activa y pertenecer al mismo usuario';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      SELECT
        EXISTS ( WITH RECURSIVE ascendencia (
            id,
            padre_id,
            camino
          ) AS (
            SELECT
              id,
              padre_id,
              ARRAY[id]
            FROM
              unidades_ubicacion
            WHERE
              id = NEW.padre_id
            UNION ALL
            SELECT
              u.id,
              u.padre_id,
              a.camino || u.id
            FROM
              unidades_ubicacion u
              JOIN ascendencia a ON u.id = a.padre_id
            WHERE
              NOT u.id = ANY (a.camino)
          )
          SELECT
            1
          FROM
            ascendencia
          WHERE
            id = NEW.id)
      INTO
        ciclo;
      IF ciclo THEN
        RAISE EXCEPTION 'Una ubicación no puede contenerse a sí misma';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END
$$;
