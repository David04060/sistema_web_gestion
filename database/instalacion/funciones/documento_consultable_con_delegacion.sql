-- Amplía la lectura ordinaria con el destinatario registrado. El resultado booleano no concede escritura.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.documento_consultable_con_delegacion (actor bigint, doc bigint)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
  AS $$
  SELECT
    public.documento_consultable (actor, doc)
    OR public.documento_delegado_por (actor, doc) IS NOT NULL
$$;
