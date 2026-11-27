-- Recibe actor y documento; devuelve lectura ordinaria por perfil, ámbito y periodos de oficina. Secretaría no
-- tiene consulta personal general.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.documento_consultable (actor bigint, doc bigint)
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
        public.documentos d
        JOIN public.usuarios u ON u.id = actor
          AND u.activo
      LEFT JOIN public.miembros_ambito m ON m.usuario_id = u.id
    WHERE
      d.id = doc
      AND (u.rol_id = 1
        OR (d.situacion <> 'ANULADO'
          AND (((u.rol_id = 3
                AND u.oficina_id IS NOT NULL)
              OR (u.rol_id = 4
                AND u.oficina_id IS NOT NULL
                AND (d.ambito_id = m.ambito_id
                  OR EXISTS (
                    SELECT
                      1
                    FROM
                      public.documentos_oficina archivo
                      JOIN public.oficina_periodos anterior ON anterior.id = archivo.periodo_id
                      JOIN public.oficina_periodos vigente ON vigente.oficina_id = anterior.oficina_id
                        AND vigente.fin IS NULL
                    WHERE
                      archivo.documento_id = d.id
                      AND anterior.fin IS NOT NULL
                      AND vigente.usuario_id = u.id
                      AND vigente.oficina_id = u.oficina_id))))
            OR (u.rol_id = 5
              AND (d.ambito_id = m.ambito_id
                OR EXISTS (
                  SELECT
                    1
                  FROM
                    public.documentos_oficina o
                    JOIN public.oficina_periodos p ON p.id = o.periodo_id
                    JOIN public.oficina_periodos actual ON actual.usuario_id = u.id
                      AND actual.oficina_id = p.oficina_id
                      AND actual.fin IS NULL
                  WHERE
                    o.documento_id = d.id
                    AND p.fin IS NOT NULL)))))))
$$;
