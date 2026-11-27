-- Al cambiar actividad u oficina, cierra el periodo anterior y abre el vigente; conserva trazabilidad de
-- titularidad.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.sincronizar_periodo_oficina ()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
  AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.activo,
      NEW.oficina_id) IS NOT DISTINCT FROM (OLD.activo,
    OLD.oficina_id) THEN
      RETURN NULL;
    END IF;
    UPDATE
      public.oficina_periodos
    SET
      fin = clock_timestamp()
    WHERE
      usuario_id = NEW.id
      AND fin IS NULL;
  END IF;
  IF NEW.activo AND NEW.oficina_id IS NOT NULL THEN
    INSERT INTO public.oficina_periodos (oficina_id, usuario_id)
      VALUES (NEW.oficina_id, NEW.id);
    INSERT INTO public.tipos_oficina (tipo_id, oficina_id)
    SELECT
      id,
      NEW.oficina_id
    FROM
      public.tipos_documentales
    WHERE
      creado_por = NEW.id
    ON CONFLICT (tipo_id)
      DO NOTHING;
  END IF;
  RETURN NULL;
END
$$;
