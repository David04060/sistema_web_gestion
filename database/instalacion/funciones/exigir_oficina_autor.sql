-- Valida al insertar que el autor documental cumple la oficina exigida para su rol.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.exigir_oficina_autor ()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog', 'public'
  AS $$
BEGIN
  IF EXISTS (
    SELECT
      1
    FROM
      public.usuarios
    WHERE
      id = NEW.registrado_por
      AND rol_id IN (3, 4)
      AND oficina_id IS NULL) THEN
    RAISE EXCEPTION 'Debe asignarse oficina antes de registrar';
  END IF;
  RETURN NEW;
END
$$;
