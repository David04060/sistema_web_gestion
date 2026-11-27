-- Antes de insertar, verifica actor, situación y destino compatible. Permite delegaciones sucesivas sin
-- cambio de ámbito.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE FUNCTION public.validar_delegacion ()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  d documentos%ROWTYPE;
  rol smallint;
  oficina bigint;
  nombre_persona text;
  titular bigint;
BEGIN
  SELECT
    *
  INTO
    d
  FROM
    documentos
  WHERE
    id = NEW.documento_id
  FOR UPDATE;
  IF d.id IS NULL OR d.situacion NOT IN ('PENDIENTE_DIRECCION', 'EN_MESA_DE_PARTES', 'PERSONAL',
    'GUARDADO_DIRECCION', 'DELEGADO') THEN
    RAISE EXCEPTION 'Documento no delegable';
  END IF;
  SELECT
    rol_id
  INTO
    rol
  FROM
    usuarios
  WHERE
    id = NEW.delegado_por
    AND activo;
  SELECT
    l.propietario_id
  INTO
    titular
  FROM
    ubicaciones_documento u
    JOIN unidades_ubicacion l ON l.id = u.unidad_id
  WHERE
    u.documento_id = d.id
    AND u.vigente
  FOR UPDATE
    OF u FOR SHARE OF l;
  IF titular IS NOT NULL AND titular <> NEW.delegado_por THEN
    RAISE EXCEPTION 'Ubicación vigente ajena';
  END IF;
  IF ((d.situacion='DELEGADO' AND (d.registrado_por=NEW.delegado_por OR public.documento_delegado_por(NEW.delegado_por,d.id) IS NOT NULL)) OR (d.situacion IN ('PENDIENTE_DIRECCION', 'GUARDADO_DIRECCION') AND rol = 3 AND (d.situacion <>
    'GUARDADO_DIRECCION' OR
    titular = NEW.delegado_por) AND EXISTS (
  SELECT
    1
  FROM
    miembros_ambito m
  WHERE
    m.usuario_id = NEW.delegado_por
      AND m.ambito_id = d.ambito_id)) OR (d.situacion = 'EN_MESA_DE_PARTES' AND rol = 4 AND d.registrado_por =
	NEW.delegado_por) OR (d.situacion = 'PERSONAL' AND rol = 5 AND d.registrado_por =
	NEW.delegado_por)) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Actor sin permiso para delegar';
  END IF;
  IF NEW.delegado_por IS DISTINCT FROM nullif(current_setting('app.actor_id',true),'')::bigint OR rol NOT IN (3,4,5) THEN
    RAISE EXCEPTION 'Actor de delegación incompatible';
  END IF;
  IF NEW.usuario_indicado_id IS NOT NULL THEN
    SELECT
      u.oficina_id,
      u.nombre || ' ' || u.apellido
    INTO
      oficina,
      nombre_persona
    FROM
      usuarios u
    WHERE
      u.id = NEW.usuario_indicado_id
      AND u.activo AND u.rol_id IN (3,4,5);
    IF nombre_persona IS NULL OR (NEW.oficina_indicada_id IS NOT NULL AND oficina IS DISTINCT FROM
      NEW.oficina_indicada_id) OR NEW.nombre_persona_guardado IS DISTINCT FROM nombre_persona THEN
      RAISE EXCEPTION 'Persona u oficina indicada incompatible';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
