-- Rechaza TRUNCATE de tablas documentales e históricas protegidas.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.impedir_truncado ()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'TRUNCATE de hechos prohibido';
END
$$;
