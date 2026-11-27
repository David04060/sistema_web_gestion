-- Tras ubicar, actualiza la situación documental y registra la ruta histórica; no transfiere autoría.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.aplicar_ubicacion ()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF (
    SELECT
      situacion
    FROM
      documentos
    WHERE
      id = NEW.documento_id) = 'PENDIENTE_DIRECCION' THEN
    UPDATE
      documentos
    SET
      situacion = 'GUARDADO_DIRECCION'
    WHERE
      id = NEW.documento_id;
  END IF;
  INSERT INTO auditoria_documental (documento_id, actor_id, accion, posterior)
    VALUES (NEW.documento_id, NEW.registrado_por, 'UBICACION', jsonb_build_object(
      'unidad_id', NEW.unidad_id,
      'ruta', NEW.ruta_ubicacion_guardada
    ));
  RETURN NULL;
END
$$;
