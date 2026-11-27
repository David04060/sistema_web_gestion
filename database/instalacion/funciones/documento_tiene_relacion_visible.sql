-- Versión anterior del filtro de relaciones, basada en lectura ordinaria. Se conserva en el catálogo; no
-- amplía permisos por delegación.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.documento_tiene_relacion_visible (actor bigint, doc bigint)
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
        AND public.documento_consultable (actor, g.id))
$$;
