-- Protege identidad y clasificación; exige permiso, motivo y transición válida y actualiza revisión/fecha.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.validar_documento_actualizacion ()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  actor bigint;
  rol smallint;
  motivo text;
  cambio_contenido boolean;
BEGIN
  IF (NEW.id,
    NEW.ambito_id,
    NEW.tipo_id,
    NEW.registrado_por,
    NEW.anio,
    NEW.correlativo,
    NEW.codigo_visible,
    NEW.prefijo_guardado,
    NEW.tipo_nombre_guardado,
    NEW.clasificacion) IS DISTINCT FROM (OLD.id,
  OLD.ambito_id,
  OLD.tipo_id,
  OLD.registrado_por,
  OLD.anio,
  OLD.correlativo,
  OLD.codigo_visible,
  OLD.prefijo_guardado,
  OLD.tipo_nombre_guardado,
  OLD.clasificacion) THEN
    RAISE EXCEPTION 'Identidad, autoría, clasificación y código inmutables';
  END IF;
  IF NEW.situacion IS DISTINCT FROM OLD.situacion AND NOT ((OLD.situacion = 'PENDIENTE_DIRECCION' AND NEW.situacion
    IN ('GUARDADO_DIRECCION', 'DELEGADO', 'ANULADO')) OR (OLD.situacion = 'EN_MESA_DE_PARTES' AND NEW.situacion
    IN ('DELEGADO', 'ANULADO')) OR (OLD.situacion = 'DELEGADO' AND NEW.situacion =
    'ANULADO' AND EXISTS (
SELECT
  1
FROM
  delegaciones_documento e
WHERE
  e.documento_id = OLD.id
  AND e.usuario_indicado_id IS NOT NULL)) OR (OLD.situacion = 'PERSONAL' AND NEW.situacion IN
    ('DELEGADO', 'ANULADO')) OR (OLD.situacion = 'GUARDADO_DIRECCION' AND (NEW.situacion =
    'ANULADO' OR (NEW.situacion = 'DELEGADO' AND EXISTS (
SELECT
  1
FROM
  delegaciones_documento e
WHERE
  e.documento_id = NEW.id))))) THEN
    RAISE EXCEPTION 'Transición documental inválida';
  END IF;
  IF OLD.situacion = 'ANULADO' THEN
    RAISE EXCEPTION 'Registro anulado inmutable';
  END IF;
  cambio_contenido := (NEW.asunto,
    NEW.remitente,
    NEW.observaciones) IS DISTINCT FROM (OLD.asunto,
    OLD.remitente,
    OLD.observaciones);
  IF cambio_contenido OR NEW.situacion = 'ANULADO' THEN
    actor := nullif (current_setting('app.actor_id', true), '')::bigint;
    motivo := current_setting('app.motivo', true);
    SELECT
      rol_id
    INTO
      rol
    FROM
      usuarios
    WHERE
      id = actor
      AND activo;
    IF actor IS NULL OR length(btrim(coalesce(motivo, ''))) = 0 THEN
      RAISE EXCEPTION 'Actor y motivo obligatorios';
    END IF;
    IF cambio_contenido AND (actor <> OLD.registrado_por OR (rol = 5 AND OLD.situacion = 'DELEGADO')) THEN
      RAISE EXCEPTION 'Corrección no autorizada';
    END IF;
    IF NEW.situacion = 'ANULADO' AND NOT (actor = OLD.registrado_por OR (OLD.situacion =
      'PENDIENTE_DIRECCION' AND rol = 3 AND (
      SELECT
        clase
      FROM
        ambitos_registro
      WHERE
        id = OLD.ambito_id) = 'COMPARTIDO_DIRECCION')) THEN
      RAISE EXCEPTION 'Anulación no autorizada';
    END IF;
  END IF;
  IF NEW.situacion = 'ANULADO' THEN
    IF NEW.situacion_antes_anulacion IS DISTINCT FROM OLD.situacion THEN
      RAISE EXCEPTION 'Debe conservarse situación anterior';
    END IF;
  ELSIF NEW.situacion_antes_anulacion IS NOT NULL THEN
    RAISE EXCEPTION 'Situación anterior solo corresponde a anulación';
  END IF;
  NEW.revision := OLD.revision + 1;
  NEW.actualizado_en := clock_timestamp();
  RETURN NEW;
END
$$;
