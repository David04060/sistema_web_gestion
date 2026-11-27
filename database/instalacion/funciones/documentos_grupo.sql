-- Recorre relaciones en ambos sentidos desde un documento y devuelve IDs del grupo. El llamador filtra cada ID
-- por actor.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.documentos_grupo (doc bigint)
  RETURNS TABLE (
    id bigint)
  LANGUAGE sql
  STABLE
  SET search_path TO 'pg_catalog',
  'public'
  AS $$
  WITH RECURSIVE grupo (
    id
  ) AS (
    SELECT
      doc
    UNION
    SELECT
      CASE WHEN r.documento_id = g.id THEN
        r.origen_id
      ELSE
        r.documento_id
      END
    FROM
      grupo g
      JOIN public.documentos_relaciones r ON r.documento_id = g.id
        OR r.origen_id = g.id
  )
  SELECT
    id
  FROM
    grupo
$$;
