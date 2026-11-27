-- Conserva la oficina de origen de un tipo documental para mapear tipos en relevos posteriores.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.registrar_oficina_tipo ()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
  AS $$
BEGIN
  INSERT INTO public.tipos_oficina
  SELECT
    NEW.id,
    u.oficina_id
  FROM
    public.usuarios u
  WHERE
    u.id = NEW.creado_por
    AND u.oficina_id IS NOT NULL;
  RETURN NULL;
END
$$;
