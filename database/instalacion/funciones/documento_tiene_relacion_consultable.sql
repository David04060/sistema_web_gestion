-- Indica si existe otro documento consultable en el grupo, incluida lectura por delegación. Lo usan filtros de
-- listado y exportación.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.documento_tiene_relacion_consultable (actor bigint, doc bigint)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO 'pg_catalog', 'public'
  AS $$
  SELECT
    EXISTS (
      SELECT
        1
      FROM
        public.documentos_grupo (doc) g
      WHERE
        g.id <> doc
        AND public.documento_consultable_con_delegacion (actor, g.id))
$$;
