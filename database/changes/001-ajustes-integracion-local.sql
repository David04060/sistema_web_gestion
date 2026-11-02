BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN IF current_database()<>'sistema_web_documental_final' OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL THEN RAISE EXCEPTION 'Se requiere base nueva local'; END IF; END $$;
ALTER TABLE public.pdf_cargas ADD COLUMN revision_esperada uuid;
CREATE OR REPLACE FUNCTION public.validar_documento_actualizacion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
      (OLD.situacion='PERSONAL' AND NEW.situacion IN ('DELEGADO','ANULADO')) OR (OLD.situacion='GUARDADO_DIRECCION' AND NEW.situacion='ANULADO')) THEN
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
END $function$;

CREATE OR REPLACE FUNCTION public.auditar_pdf()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE actor bigint; accion text; doc bigint;
BEGIN
  actor:=nullif(current_setting('app.actor_id',true),'')::bigint;
  doc:=CASE WHEN TG_OP='DELETE' THEN OLD.documento_id ELSE NEW.documento_id END;
  accion:=CASE TG_OP WHEN 'INSERT' THEN 'CARGA' WHEN 'UPDATE' THEN 'REEMPLAZO' ELSE 'ELIMINACION' END;
  IF TG_OP IN ('UPDATE','DELETE') THEN
    INSERT INTO pdf_objetos_pendientes(clave_r2,documento_id,limpiar_desde)
      VALUES (OLD.clave_r2,doc,clock_timestamp()) ON CONFLICT(clave_r2) DO UPDATE SET limpiar_desde=least(pdf_objetos_pendientes.limpiar_desde,EXCLUDED.limpiar_desde),eliminado_en=NULL;
  END IF;
  INSERT INTO pdf_eventos(documento_id,actor_id,accion,revision)
    VALUES (doc,actor,accion,CASE WHEN TG_OP='DELETE' THEN OLD.revision ELSE NEW.revision END);
  INSERT INTO auditoria_documental(documento_id,actor_id,accion,anterior,posterior)
    VALUES (doc,actor,'PDF_'||accion,
      CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD)-'clave_r2' END,
      CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW)-'clave_r2' END);
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.registrar_cambio_nombre_campo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE actor bigint; rol smallint; motivo text;
BEGIN
  IF (NEW.id,NEW.usuario_id,NEW.creado_por,NEW.creado_en) IS DISTINCT FROM
     (OLD.id,OLD.usuario_id,OLD.creado_por,OLD.creado_en) THEN
    RAISE EXCEPTION 'Identidad del campo inmutable';
  END IF;
  IF NEW.nombre_actual IS NOT DISTINCT FROM OLD.nombre_actual THEN RETURN NEW; END IF;
  actor:=nullif(current_setting('app.actor_id',true),'')::bigint;
  motivo:=current_setting('app.motivo',true);
  SELECT rol_id INTO rol FROM usuarios WHERE id=actor AND activo;
  IF coalesce(rol NOT IN (1,2),true) OR length(btrim(coalesce(motivo,'')))=0 THEN
    RAISE EXCEPTION 'Cambio de campo requiere administrador y motivo';
  END IF;
  INSERT INTO cambios_nombre_campo(campo_id,nombre_anterior,nombre_nuevo,actor_id,motivo)
    VALUES (OLD.id,OLD.nombre_actual,NEW.nombre_actual,actor,motivo);
  INSERT INTO auditoria_configuracion(actor_id,entidad,entidad_id,accion,motivo,anterior,posterior)
    VALUES (actor,'CAMPO_OPCIONAL',OLD.id,'RENOMBRAR',motivo,
      jsonb_build_object('nombre',OLD.nombre_actual),jsonb_build_object('nombre',NEW.nombre_actual));
  RETURN NEW;
END $function$;

COMMIT;
