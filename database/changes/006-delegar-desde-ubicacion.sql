BEGIN;
SET LOCAL search_path TO public;

CREATE OR REPLACE FUNCTION public.validar_delegacion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE d documentos%ROWTYPE; rol smallint; oficina bigint; nombre_persona text; titular bigint;
BEGIN
 SELECT * INTO d FROM documentos WHERE id=NEW.documento_id FOR UPDATE;
 IF d.id IS NULL OR d.situacion NOT IN ('PENDIENTE_DIRECCION','EN_MESA_DE_PARTES','PERSONAL','GUARDADO_DIRECCION') THEN
   RAISE EXCEPTION 'Documento no delegable';
 END IF;
 SELECT rol_id INTO rol FROM usuarios WHERE id=NEW.delegado_por AND activo;
 SELECT l.propietario_id INTO titular FROM ubicaciones_documento u
 JOIN unidades_ubicacion l ON l.id=u.unidad_id
 WHERE u.documento_id=d.id AND u.vigente FOR UPDATE OF u FOR SHARE OF l;
 IF titular IS NOT NULL AND titular<>NEW.delegado_por THEN
   RAISE EXCEPTION 'Ubicación vigente ajena';
 END IF;
 IF ((d.situacion IN ('PENDIENTE_DIRECCION','GUARDADO_DIRECCION') AND rol=3
      AND (d.situacion<>'GUARDADO_DIRECCION' OR titular=NEW.delegado_por)
      AND EXISTS (SELECT 1 FROM miembros_ambito m
        WHERE m.usuario_id=NEW.delegado_por AND m.ambito_id=d.ambito_id)) OR
     (d.situacion='EN_MESA_DE_PARTES' AND rol=4 AND d.registrado_por=NEW.delegado_por) OR
     (d.situacion='PERSONAL' AND rol=5 AND d.registrado_por=NEW.delegado_por)) IS DISTINCT FROM TRUE THEN
   RAISE EXCEPTION 'Actor sin permiso para delegar';
 END IF;
 IF NEW.usuario_indicado_id IS NOT NULL THEN
   SELECT u.oficina_id,u.nombre||' '||u.apellido INTO oficina,nombre_persona
     FROM usuarios u WHERE u.id=NEW.usuario_indicado_id AND u.activo;
   IF nombre_persona IS NULL OR
      (NEW.oficina_indicada_id IS NOT NULL AND oficina IS DISTINCT FROM NEW.oficina_indicada_id) OR
      NEW.nombre_persona_guardado IS DISTINCT FROM nombre_persona THEN
     RAISE EXCEPTION 'Persona u oficina indicada incompatible';
   END IF;
 END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.validar_documento_actualizacion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE actor bigint; rol smallint; motivo text; cambio_contenido boolean;
BEGIN
  IF (NEW.id,NEW.ambito_id,NEW.tipo_id,NEW.registrado_por,NEW.anio,
      NEW.correlativo,NEW.codigo_visible,NEW.prefijo_guardado,NEW.tipo_nombre_guardado,NEW.clasificacion)
     IS DISTINCT FROM
     (OLD.id,OLD.ambito_id,OLD.tipo_id,OLD.registrado_por,OLD.anio,
      OLD.correlativo,OLD.codigo_visible,OLD.prefijo_guardado,OLD.tipo_nombre_guardado,OLD.clasificacion) THEN
    RAISE EXCEPTION 'Identidad, autoría, clasificación y código inmutables';
  END IF;
  IF NEW.situacion IS DISTINCT FROM OLD.situacion AND NOT (
      (OLD.situacion='PENDIENTE_DIRECCION' AND NEW.situacion IN ('GUARDADO_DIRECCION','DELEGADO','ANULADO')) OR
      (OLD.situacion='EN_MESA_DE_PARTES' AND NEW.situacion IN ('DELEGADO','ANULADO')) OR
      (OLD.situacion='PERSONAL' AND NEW.situacion IN ('DELEGADO','ANULADO')) OR (OLD.situacion='GUARDADO_DIRECCION' AND
      (NEW.situacion='ANULADO' OR (NEW.situacion='DELEGADO' AND EXISTS (
        SELECT 1 FROM delegaciones_documento e WHERE e.documento_id=NEW.id))))) THEN
    RAISE EXCEPTION 'Transición documental inválida';
  END IF;
  IF OLD.situacion='ANULADO' THEN RAISE EXCEPTION 'Registro anulado inmutable'; END IF;
  cambio_contenido := (NEW.asunto,NEW.remitente,NEW.observaciones) IS DISTINCT FROM
                      (OLD.asunto,OLD.remitente,OLD.observaciones);
  IF cambio_contenido OR NEW.situacion='ANULADO' THEN
    actor := nullif(current_setting('app.actor_id',true),'')::bigint;
    motivo := current_setting('app.motivo',true);
    SELECT rol_id INTO rol FROM usuarios WHERE id=actor AND activo;
    IF actor IS NULL OR length(btrim(coalesce(motivo,'')))=0 THEN
      RAISE EXCEPTION 'Actor y motivo obligatorios';
    END IF;
    IF cambio_contenido AND
       (actor<>OLD.registrado_por OR (rol=5 AND OLD.situacion='DELEGADO')) THEN
      RAISE EXCEPTION 'Corrección no autorizada';
    END IF;
    IF NEW.situacion='ANULADO' AND NOT
       (actor=OLD.registrado_por OR
        (OLD.situacion='PENDIENTE_DIRECCION' AND rol=3 AND
         (SELECT clase FROM ambitos_registro WHERE id=OLD.ambito_id)='COMPARTIDO_DIRECCION')) THEN
      RAISE EXCEPTION 'Anulación no autorizada';
    END IF;
  END IF;
  IF NEW.situacion='ANULADO' THEN
    IF NEW.situacion_antes_anulacion IS DISTINCT FROM OLD.situacion THEN
      RAISE EXCEPTION 'Debe conservarse situación anterior'; END IF;
  ELSIF NEW.situacion_antes_anulacion IS NOT NULL THEN
    RAISE EXCEPTION 'Situación anterior solo corresponde a anulación';
  END IF;
  NEW.revision:=OLD.revision+1;
  NEW.actualizado_en:=clock_timestamp();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.aplicar_delegacion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE situacion_anterior text; ruta_anterior text; oficina_anterior text;
BEGIN
  SELECT situacion INTO situacion_anterior FROM documentos WHERE id=NEW.documento_id;
  UPDATE ubicaciones_documento SET vigente=false
    WHERE documento_id=NEW.documento_id AND vigente
    RETURNING ruta_ubicacion_guardada,oficina_nombre_guardado INTO ruta_anterior,oficina_anterior;
  UPDATE documentos SET situacion='DELEGADO' WHERE id=NEW.documento_id;
  INSERT INTO auditoria_documental(documento_id,actor_id,accion,anterior,posterior)
    VALUES (NEW.documento_id,NEW.delegado_por,'DELEGACION',
      jsonb_build_object('situacion',situacion_anterior,'ruta',ruta_anterior,'oficina',oficina_anterior),
      jsonb_build_object('situacion','DELEGADO','ruta',NULL,'persona',NEW.nombre_persona_guardado,
        'oficina_id',NEW.oficina_indicada_id,'observaciones',NEW.observaciones));
  RETURN NULL;
END $$;
COMMIT;
