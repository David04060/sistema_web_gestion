-- Rechaza DELETE de documentos: la operación de negocio es anular y conservar historial.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.impedir_borrado_documento ()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'Documento inmutable; usar anulación lógica';
END
$$;
