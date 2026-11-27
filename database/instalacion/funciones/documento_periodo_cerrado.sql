-- Indica si el documento pertenece a un periodo institucional cerrado, utilizado para impedir mutaciones
-- históricas.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.documento_periodo_cerrado (doc bigint)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
  AS $$
  SELECT
    EXISTS (
      SELECT
        1
      FROM
        public.documentos_oficina o
        JOIN public.oficina_periodos p ON p.id = o.periodo_id
      WHERE
        o.documento_id = doc
        AND p.fin IS NOT NULL)
$$;
