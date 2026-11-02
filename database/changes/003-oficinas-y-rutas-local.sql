-- Exclusividad de oficinas y rutas legibles futuras; no reescribe datos históricos.
BEGIN;
DO $$ BEGIN IF current_database()<>'sistema_web_documental_final' OR (SELECT oid FROM pg_database WHERE datname=current_database())<>98367 OR inet_server_addr() NOT IN ('127.0.0.1'::inet,'::1'::inet) THEN RAISE EXCEPTION 'Destino local incorrecto'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.validar_usuario_oficina()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE o text;
BEGIN
  IF NEW.rol_id=3 THEN
    SELECT nombre INTO o FROM oficinas WHERE id=NEW.oficina_id;
    IF o IS DISTINCT FROM 'Dirección' THEN RAISE EXCEPTION 'Dirección requiere su oficina'; END IF;
  ELSIF NEW.rol_id=4 THEN
    SELECT nombre INTO o FROM oficinas WHERE id=NEW.oficina_id;
    IF o IS DISTINCT FROM 'Mesa de Partes' THEN RAISE EXCEPTION 'Secretaría requiere Mesa de Partes'; END IF;
  ELSIF NEW.rol_id IN (1,2) AND NEW.oficina_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cuenta administrativa sin oficina documental';
  END IF;
  IF NEW.rol_id=5 AND EXISTS(SELECT 1 FROM oficinas WHERE id=NEW.oficina_id AND nombre IN('Dirección','Mesa de Partes')) THEN RAISE EXCEPTION 'Usuario no puede asignarse a Dirección ni Mesa de Partes'; END IF;
  NEW.actualizada_en:=clock_timestamp();
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.validar_ubicacion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE d documentos%ROWTYPE; propietario bigint; rol smallint;
        onombre text; ruta text;
BEGIN
  SELECT * INTO d FROM documentos WHERE id=NEW.documento_id FOR UPDATE;
  SELECT u.propietario_id,o.nombre INTO propietario,onombre
    FROM unidades_ubicacion u JOIN oficinas o ON o.id=u.oficina_id
    WHERE u.id=NEW.unidad_id AND u.activo;
  SELECT rol_id INTO rol FROM usuarios WHERE id=NEW.registrado_por AND activo;
  IF propietario IS NULL OR propietario<>NEW.registrado_por OR d.situacion IN ('ANULADO','DELEGADO') THEN
    RAISE EXCEPTION 'Ubicación no permitida';
  END IF;
  IF ((d.situacion='PERSONAL' AND rol=5 AND d.registrado_por=NEW.registrado_por) OR
      (d.situacion='EN_MESA_DE_PARTES' AND rol=4 AND d.registrado_por=NEW.registrado_por) OR
      (d.situacion='PENDIENTE_DIRECCION' AND rol=3)) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Actor sin permiso de ubicación';
  END IF;
  NEW.oficina_nombre_guardado:=onombre;
  WITH RECURSIVE cadena(id,padre_id,clase,nombre,profundidad,camino) AS (
    SELECT id,padre_id,clase,nombre,0,ARRAY[id]
      FROM unidades_ubicacion WHERE id=NEW.unidad_id
    UNION ALL
    SELECT u.id,u.padre_id,u.clase,u.nombre,c.profundidad+1,c.camino||u.id
      FROM unidades_ubicacion u JOIN cadena c ON u.id=c.padre_id
      WHERE NOT u.id=ANY(c.camino)
  ) SELECT string_agg(CASE WHEN padre_id IS NULL AND clase<>'Lugar' THEN clase||': '||nombre ELSE nombre END,' / ' ORDER BY profundidad DESC)
      INTO ruta FROM cadena;
  NEW.ruta_ubicacion_guardada:=ruta;
  RETURN NEW;
END $function$;

COMMIT;
