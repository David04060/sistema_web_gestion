-- Valida que origen, destino y ámbito del tipo correspondan al relevo; evita asociaciones ajenas.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.validar_mapeo_tipo_relevo ()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog', 'public'
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT
      1
    FROM
      public.usuarios
    WHERE
      id = nullif (current_setting('app.actor_id', true), '')::bigint
      AND activo
      AND rol_id IN (1, 2)) THEN
    RAISE EXCEPTION 'Mapeo de tipos requiere administración'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT
      1
    FROM
      public.tipos_documentales origen
      JOIN public.tipos_oficina o ON o.tipo_id = origen.id
      JOIN public.usuarios u ON u.oficina_id = o.oficina_id
        AND u.activo
        AND u.rol_id = 5
      JOIN public.miembros_ambito m ON m.usuario_id = u.id
        AND m.ambito_id = NEW.destino_ambito_id
      JOIN public.tipos_documentales destino ON destino.id = NEW.tipo_id
        AND destino.ambito_id = m.ambito_id
    WHERE
      origen.id = NEW.origen_id
      AND origen.activo
      AND destino.activo
      AND origen.nombre = destino.nombre
      AND origen.prefijo = destino.prefijo) THEN
    RAISE EXCEPTION 'Mapeo de tipos incompatible con oficina o catálogo';
  END IF;
  RETURN NEW;
END
$$;
