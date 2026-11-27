-- Devuelve el nombre del emisor para una cuenta destinataria elegible; NULL significa que no hay acceso por
-- esta delegación.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.documento_delegado_por (actor bigint, doc bigint)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
  AS $$
  SELECT
    concat_ws(' ', emisor.nombre, emisor.apellido)
  FROM
    public.delegaciones_documento e
    JOIN public.documentos d ON d.id = e.documento_id
      AND d.situacion = 'DELEGADO'
    JOIN public.usuarios u ON u.id = e.usuario_indicado_id
      AND u.activo
    JOIN public.usuarios emisor ON emisor.id = e.delegado_por
  WHERE
    e.documento_id = doc
    AND u.id = actor
    AND u.id <> d.registrado_por
    AND (u.rol_id = 5
      OR (u.rol_id IN (3, 4)
        AND u.oficina_id IS NOT NULL))
  ORDER BY e.delegado_en DESC,e.id DESC LIMIT 1
$$;
