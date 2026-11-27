-- Tras insertar la constancia, cierra ubicación vigente, cambia situación y registra auditoría dentro de la
-- misma transacción.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.aplicar_delegacion ()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  situacion_anterior text;
  ruta_anterior text;
  oficina_anterior text;
BEGIN
  SELECT
    situacion
  INTO
    situacion_anterior
  FROM
    documentos
  WHERE
    id = NEW.documento_id;
  UPDATE
    ubicaciones_documento
  SET
    vigente = false
  WHERE
    documento_id = NEW.documento_id
    AND vigente
  RETURNING
    ruta_ubicacion_guardada,
    oficina_nombre_guardado
  INTO
    ruta_anterior,
    oficina_anterior;
  UPDATE
    documentos
  SET
    situacion = 'DELEGADO'
  WHERE
    id = NEW.documento_id;
  INSERT INTO auditoria_documental (documento_id, actor_id, accion, anterior, posterior)
    VALUES (NEW.documento_id, NEW.delegado_por, 'DELEGACION', jsonb_build_object(
      'situacion', situacion_anterior,
      'ruta', ruta_anterior,
      'oficina', oficina_anterior
    ), jsonb_build_object(
      'situacion', 'DELEGADO',
      'ruta', NULL,
      'persona', NEW.nombre_persona_guardado,
      'oficina_id', NEW.oficina_indicada_id,
      'observaciones', NEW.observaciones
    ));
  RETURN NULL;
END
$$;
