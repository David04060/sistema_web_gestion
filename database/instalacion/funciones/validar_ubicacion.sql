-- Verifica propietario, oficina, estado y jerarquía elegibles antes de registrar una ubicación histórica.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.validar_ubicacion ()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  d documentos%ROWTYPE;
  propietario bigint;
  rol smallint;
  onombre text;
  ruta text;
BEGIN
  SELECT
    *
  INTO
    d
  FROM
    documentos
  WHERE
    id = NEW.documento_id
  FOR UPDATE;
  SELECT
    u.propietario_id,
    o.nombre
  INTO
    propietario,
    onombre
  FROM
    unidades_ubicacion u
    JOIN oficinas o ON o.id = u.oficina_id
  WHERE
    u.id = NEW.unidad_id
    AND u.activo;
  SELECT
    rol_id
  INTO
    rol
  FROM
    usuarios
  WHERE
    id = NEW.registrado_por
    AND activo;
  IF propietario IS NULL OR propietario <> NEW.registrado_por OR d.situacion IN ('ANULADO', 'DELEGADO') THEN
    RAISE EXCEPTION 'Ubicación no permitida';
  END IF;
  IF ((d.situacion = 'PERSONAL' AND rol = 5 AND d.registrado_por = NEW.registrado_por) OR (d.situacion =
    'EN_MESA_DE_PARTES' AND rol = 4 AND d.registrado_por = NEW.registrado_por) OR (d.situacion = 'PENDIENTE_DIRECCION'
    AND rol = 3)) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Actor sin permiso de ubicación';
  END IF;
  NEW.oficina_nombre_guardado := onombre;
  WITH RECURSIVE cadena (
    id,
    padre_id,
    clase,
    nombre,
    profundidad,
    camino
  ) AS (
    SELECT
      id,
      padre_id,
      clase,
      nombre,
      0,
      ARRAY[id]
    FROM
      unidades_ubicacion
    WHERE
      id = NEW.unidad_id
    UNION ALL
    SELECT
      u.id,
      u.padre_id,
      u.clase,
      u.nombre,
      c.profundidad + 1,
      c.camino || u.id
    FROM
      unidades_ubicacion u
      JOIN cadena c ON u.id = c.padre_id
    WHERE
      NOT u.id = ANY (c.camino)
  )
  SELECT
    string_agg(
      CASE WHEN padre_id IS NULL
        AND clase <> 'Lugar' THEN
        clase || ': ' || nombre
      ELSE
        nombre
      END, ' / ' ORDER BY profundidad DESC)
  INTO
    ruta
  FROM
    cadena;
  NEW.ruta_ubicacion_guardada := ruta;
  RETURN NEW;
END
$$;
