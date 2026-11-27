-- Vincula el alta al periodo de oficina vigente del autor para permitir consulta histórica tras relevo.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.registrar_oficina_documento ()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
  AS $$
BEGIN
  INSERT INTO public.documentos_oficina (documento_id, periodo_id)
  SELECT
    NEW.id,
    p.id
  FROM
    public.oficina_periodos p
    JOIN public.usuarios u ON u.id = p.usuario_id
      AND u.activo
      AND u.oficina_id = p.oficina_id
  WHERE
    p.usuario_id = NEW.registrado_por
    AND p.fin IS NULL;
  RETURN NULL;
END
$$;
