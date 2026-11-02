-- Cambio local aditivo: no modifica datos, custodia, circulación ni migraciones aplicadas.
BEGIN;
CREATE OR REPLACE FUNCTION public.fn_documento_permisos_contenido(doc bigint, lector bigint)
RETURNS TABLE(editar boolean,anular boolean) LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $p$
WITH base AS (
 SELECT d.*,r.nombre rol,o.nombre oficina,f.situacion,f.tipo,f.usuario_id,
 u.activo actor_activo, t.requiere_clave OR lower(btrim(t.nombre))='síseve' protegido
 FROM public.documentos d JOIN public.usuarios u ON u.id=lector JOIN public.roles r ON r.id=u.rol_id
 JOIN public.oficinas o ON o.id=d.oficina_responsable_id JOIN public.tipos_documentales t ON t.id=d.tipo_documental_id
 LEFT JOIN public.entregas_secretaria f ON f.documento_id=d.id WHERE d.id=doc
), reglas AS (
 SELECT *,actor_activo AND activo AND NOT protegido AND rol IN ('Usuario','Secretaria de Dirección','Director(a)')
 AND estado_tramite IN ('RECIBIDO','PENDIENTE_DECISION') AND NOT EXISTS(
 SELECT 1 FROM public.movimientos_documentales m WHERE m.documento_id=doc AND (m.estado='EN_TRASLADO' OR (m.estado='RECHAZADO' AND m.devolucion_confirmada_por_id IS NULL))) libre
 FROM base
)
SELECT libre AND CASE
 WHEN situacion IN ('DELEGADO','ENTREGADO') THEN
  CASE WHEN tipo='USUARIO' THEN usuario_id=lector
       WHEN tipo='PERSONA' THEN rol IN ('Secretaria de Dirección','Director(a)') ELSE false END
 WHEN situacion='GUARDADO_DIRECCION' THEN rol IN ('Secretaria de Dirección','Director(a)')
 WHEN situacion='GUARDADO_SECRETARIA' THEN rol='Secretaria de Dirección' AND responsable_actual_id=lector
 WHEN oficina IN ('Dirección','Mesa de Partes') AND estado_tramite='PENDIENTE_DECISION' THEN rol IN ('Secretaria de Dirección','Director(a)')
 ELSE responsable_actual_id=lector OR (oficina='Dirección' AND rol IN ('Secretaria de Dirección','Director(a)')) END,
 libre AND rol='Secretaria de Dirección' AND registrado_por_id=lector AND responsable_actual_id=lector
 AND oficina='Mesa de Partes' AND coalesce(situacion,'PENDIENTE_DECISION') IN ('PENDIENTE_DECISION','GUARDADO_SECRETARIA')
FROM reglas;
$p$;
REVOKE ALL ON FUNCTION public.fn_documento_permisos_contenido(bigint,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_documento_permisos_contenido(bigint,bigint) TO sistema_web_app;
CREATE OR REPLACE FUNCTION public.fn_documentos_proteger_integridad()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE actor record; movimiento record; cambia_autorizacion boolean;
BEGIN
 SELECT * INTO actor FROM public.fn_documental_actor();
 IF TG_OP='INSERT' THEN
  IF NEW.registrado_por_id<>actor.id OR NEW.responsable_actual_id<>actor.id
     OR actor.oficina_id IS NULL OR NEW.oficina_responsable_id IS DISTINCT FROM actor.oficina_id
     OR NOT NEW.activo OR NEW.destinatario_autorizado_id IS NOT NULL
     OR NEW.oficina_destino_autorizada_id IS NOT NULL OR NEW.decision_autorizada_por_id IS NOT NULL THEN
   RAISE EXCEPTION 'Registro inicial incompatible con el actor y su oficina' USING ERRCODE='23514';
  END IF;
  IF (actor.rol='Secretaria de Dirección' OR actor.oficina='Mesa de Partes') THEN
   IF NEW.estado_tramite<>'PENDIENTE_DECISION' THEN
    RAISE EXCEPTION 'Mesa de Partes registra PENDIENTE_DECISION' USING ERRCODE='23514';
   END IF;
  ELSIF NEW.estado_tramite<>'RECIBIDO' THEN
   RAISE EXCEPTION 'El registro ordinario confirma custodia inicial' USING ERRCODE='23514';
  END IF;
  PERFORM public.fn_documental_validar_archivador(NEW.archivador_id,NEW.responsable_actual_id,NEW.oficina_responsable_id);
  RETURN NEW;
 END IF;
 IF ROW(NEW.id,NEW.codigo,NEW.tipo_documental_id,NEW.registrado_por_id,NEW.fecha_creacion)
  IS DISTINCT FROM ROW(OLD.id,OLD.codigo,OLD.tipo_documental_id,OLD.registrado_por_id,OLD.fecha_creacion) THEN
  RAISE EXCEPTION 'Los identificadores y la autoria original son inmutables' USING ERRCODE='23514';
 END IF;
 IF NOT OLD.activo AND (to_jsonb(NEW)-'fecha_modificacion') IS DISTINCT FROM (to_jsonb(OLD)-'fecha_modificacion') THEN
  RAISE EXCEPTION 'No se puede modificar un documento anulado' USING ERRCODE='23514';
 END IF;
 IF NEW.estado_tramite IS DISTINCT FROM OLD.estado_tramite AND NOT (
  (OLD.estado_tramite='PENDIENTE_DECISION' AND NEW.estado_tramite IN ('EN_TRASLADO','CANCELADO'))
  OR (OLD.estado_tramite='RECIBIDO' AND NEW.estado_tramite IN ('PENDIENTE_DECISION','EN_TRASLADO','CANCELADO'))
  OR (OLD.estado_tramite='EN_TRASLADO' AND NEW.estado_tramite IN ('RECIBIDO','RECHAZADO'))
  OR (OLD.estado_tramite='RECHAZADO' AND NEW.estado_tramite='RECIBIDO')
 ) THEN
  RAISE EXCEPTION 'Transicion documental no permitida' USING ERRCODE='23514';
 END IF;
 cambia_autorizacion := ROW(NEW.destinatario_autorizado_id,NEW.oficina_destino_autorizada_id,NEW.decision_autorizada_por_id)
   IS DISTINCT FROM ROW(OLD.destinatario_autorizado_id,OLD.oficina_destino_autorizada_id,OLD.decision_autorizada_por_id);
 IF cambia_autorizacion AND NEW.estado_tramite='PENDIENTE_DECISION' THEN
  IF OLD.estado_tramite<>'PENDIENTE_DECISION' OR actor.rol IS DISTINCT FROM 'Director(a)' OR actor.oficina IS DISTINCT FROM 'Dirección'
     OR (to_jsonb(NEW)-ARRAY['fecha_modificacion','destinatario_autorizado_id','oficina_destino_autorizada_id','decision_autorizada_por_id'])
        IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['fecha_modificacion','destinatario_autorizado_id','oficina_destino_autorizada_id','decision_autorizada_por_id']) THEN
   RAISE EXCEPTION 'Solo Direccion modifica la autorizacion, conservando estado, contenido y custodia' USING ERRCODE='23514';
  END IF;
  IF NEW.destinatario_autorizado_id IS NOT NULL THEN
   IF NEW.decision_autorizada_por_id IS DISTINCT FROM actor.id
      OR NEW.oficina_destino_autorizada_id IS NULL
      OR NEW.destinatario_autorizado_id=OLD.responsable_actual_id THEN
    RAISE EXCEPTION 'Autorizacion incompleta o autor incompatible' USING ERRCODE='23514';
   END IF;
   PERFORM public.fn_documental_validar_destino(NEW.destinatario_autorizado_id,NEW.oficina_destino_autorizada_id);
  END IF;
  RETURN NEW; -- CHECK y auditoria se ejecutan; no se crea un movimiento.
 END IF;
 -- Los demas cambios pertenecen al custodio, salvo la recepcion real del destinatario.
 IF OLD.estado_tramite IN ('EN_TRASLADO','RECHAZADO') AND
    ROW(NEW.asunto,NEW.remitente,NEW.observaciones) IS DISTINCT FROM ROW(OLD.asunto,OLD.remitente,OLD.observaciones) THEN
  RAISE EXCEPTION 'No se corrige contenido durante circulacion o recuperacion pendiente' USING ERRCODE='23514';
 END IF;
 -- Corrección de contenido ordinario: permite solo los tres campos editables.
 IF EXISTS(SELECT 1 FROM public.tipos_documentales t WHERE t.id=OLD.tipo_documental_id AND NOT t.requiere_clave AND lower(btrim(t.nombre))<>'síseve') THEN
  IF (to_jsonb(NEW)-ARRAY['asunto','remitente','observaciones','fecha_modificacion'])
     IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['asunto','remitente','observaciones','fecha_modificacion']) THEN
   IF NOT coalesce((SELECT editar FROM public.fn_documento_permisos_contenido(OLD.id,actor.id)),false) THEN
    RAISE EXCEPTION 'No tiene permiso para corregir este documento' USING ERRCODE='23514';
   END IF;
   RETURN NEW;
  END IF;
  IF OLD.activo AND NOT NEW.activo AND NOT coalesce((SELECT anular FROM public.fn_documento_permisos_contenido(OLD.id,actor.id)),false) THEN
   RAISE EXCEPTION 'No tiene permiso para anular este documento' USING ERRCODE='23514';
  END IF;
 END IF;
 IF actor.id<>OLD.responsable_actual_id THEN
  IF NOT (OLD.estado_tramite='EN_TRASLADO' AND (
   (NEW.estado_tramite='RECIBIDO' AND EXISTS (
    SELECT 1 FROM public.movimientos_documentales m WHERE m.documento_id=OLD.id
     AND m.estado='RECIBIDO' AND m.recibido_por_id=actor.id
     AND m.usuario_destino_id=NEW.responsable_actual_id AND m.oficina_destino_id=NEW.oficina_responsable_id
     AND m.id=(SELECT max(id) FROM public.movimientos_documentales WHERE documento_id=OLD.id)))
   OR (NEW.estado_tramite='RECHAZADO' AND EXISTS (
    SELECT 1 FROM public.movimientos_documentales m WHERE m.documento_id=OLD.id
     AND m.estado='RECHAZADO' AND m.rechazado_por_id=actor.id AND m.usuario_destino_id=actor.id
     AND m.id=(SELECT max(id) FROM public.movimientos_documentales WHERE documento_id=OLD.id)))
  )) THEN
   RAISE EXCEPTION 'El actor no tiene permiso para modificar el documento' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.estado_tramite='EN_TRASLADO' AND OLD.estado_tramite<>'EN_TRASLADO' THEN
  SELECT * INTO movimiento FROM public.movimientos_documentales m
   WHERE m.documento_id=OLD.id AND m.estado='EN_TRASLADO' FOR UPDATE;
  IF NOT FOUND OR movimiento.usuario_origen_id<>OLD.responsable_actual_id
     OR movimiento.oficina_origen_id<>OLD.oficina_responsable_id
     OR NEW.responsable_actual_id<>OLD.responsable_actual_id
     OR NEW.oficina_responsable_id<>OLD.oficina_responsable_id THEN
   RAISE EXCEPTION 'La salida requiere el movimiento correspondiente y conserva custodia de entrega en origen' USING ERRCODE='23514';
  END IF;
  IF OLD.estado_tramite='PENDIENTE_DECISION' THEN
   IF OLD.destinatario_autorizado_id IS NULL OR OLD.oficina_destino_autorizada_id IS NULL
      OR OLD.decision_autorizada_por_id IS NULL
      OR movimiento.usuario_destino_id IS DISTINCT FROM OLD.destinatario_autorizado_id
      OR movimiento.oficina_destino_id IS DISTINCT FROM OLD.oficina_destino_autorizada_id
      OR movimiento.decidido_por_id IS DISTINCT FROM OLD.decision_autorizada_por_id THEN
    RAISE EXCEPTION 'La salida no coincide con la autorizacion de Direccion' USING ERRCODE='23514';
   END IF;
  END IF;
  IF NEW.archivador_id IS NOT NULL OR NEW.destinatario_autorizado_id IS NOT NULL
     OR NEW.oficina_destino_autorizada_id IS NOT NULL OR NEW.decision_autorizada_por_id IS NOT NULL THEN
   RAISE EXCEPTION 'La salida consume la autorizacion y retira el archivador confirmado' USING ERRCODE='23514';
  END IF;
 END IF;
 IF ROW(NEW.responsable_actual_id,NEW.oficina_responsable_id) IS DISTINCT FROM ROW(OLD.responsable_actual_id,OLD.oficina_responsable_id)
    AND NOT (OLD.estado_tramite='EN_TRASLADO' AND NEW.estado_tramite='RECIBIDO') THEN
  RAISE EXCEPTION 'Solo la recepcion puede transferir custodia' USING ERRCODE='23514';
 END IF;
 IF NEW.archivador_id IS DISTINCT FROM OLD.archivador_id THEN
  IF NOT ((OLD.estado_tramite IN ('PENDIENTE_DECISION','RECIBIDO') AND NEW.estado_tramite='EN_TRASLADO')
       OR (OLD.estado_tramite IN ('EN_TRASLADO','RECHAZADO') AND NEW.estado_tramite='RECIBIDO')) THEN
   RAISE EXCEPTION 'El archivador solo cambia mediante salida, recepcion o recuperacion confirmada' USING ERRCODE='23514';
  END IF;
  IF NEW.estado_tramite NOT IN ('EN_TRASLADO','RECHAZADO') THEN
   PERFORM public.fn_documental_validar_archivador(NEW.archivador_id,NEW.responsable_actual_id,NEW.oficina_responsable_id);
  END IF;
 END IF;
 RETURN NEW;
END;
$function$

COMMIT;
