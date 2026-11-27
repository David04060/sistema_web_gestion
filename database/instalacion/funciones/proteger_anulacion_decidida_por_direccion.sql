-- Impide anulación por Secretaría después de decisión de Dirección; valida actor transaccional y situación
-- previa.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.proteger_anulacion_decidida_por_direccion ()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog', 'public'
  AS $$
BEGIN
  -- La regla se suma a los controles de autoría y de periodo histórico existentes.
  -- En un alta de Secretaría, una delegación por otro actor solo se permite a Dirección.
  IF EXISTS (
    SELECT
      1
    FROM
      public.usuarios
    WHERE
      id = nullif (current_setting('app.actor_id', true), '')::bigint
      AND activo
      AND rol_id = 4) AND (OLD.situacion = 'GUARDADO_DIRECCION' OR (OLD.situacion = 'DELEGADO' AND EXISTS (
  SELECT
    1
  FROM
    public.delegaciones_documento
  WHERE
    documento_id = OLD.id
      AND delegado_por <> OLD.registrado_por))) THEN
    RAISE EXCEPTION 'Secretaría no puede anular después de la decisión de Dirección'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
