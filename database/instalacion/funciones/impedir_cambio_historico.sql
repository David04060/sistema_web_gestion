-- Rechaza UPDATE/DELETE de hechos y auditorías inmutables.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.impedir_cambio_historico ()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'Registro histórico inmutable';
END
$$;
