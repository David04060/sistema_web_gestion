-- OPCION A VALIDADA EN ROLLBACK Y BASE QA; PENDIENTE APLICACION PERMANENTE.
-- Autorizar conserva PENDIENTE_DECISION; salir cambia directamente a EN_TRASLADO.
-- Cinco estados aprobados; ningun cambio automatico de estados historicos.
-- Documento: PENDIENTE_DECISION, EN_TRASLADO, RECIBIDO, RECHAZADO, CANCELADO.
-- Movimiento fisico: EN_TRASLADO, RECIBIDO, RECHAZADO, CANCELADO.
-- Incluye tres FK nuevas para separar autorizacion de Direccion y salida fisica.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$
BEGIN
 IF current_database() <> 'sistema_web_final' THEN
  RAISE EXCEPTION 'Base de datos no autorizada';
 END IF;
END $$;
LOCK TABLE public.documentos, public.movimientos_documentales IN ACCESS EXCLUSIVE MODE;

-- Guardas de datos: no convertir, eliminar ni reinterpretar registros existentes.
-- Si aparecen valores antiguos fuera de los cinco aprobados, toda la operacion aborta.
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.documentos WHERE estado_tramite NOT IN
   ('PENDIENTE_DECISION','EN_TRASLADO','RECIBIDO','RECHAZADO','CANCELADO')) THEN
  RAISE EXCEPTION 'Existen documentos con estados fuera del catalogo aprobado: revisar datos antes de migrar';
 END IF;
 IF EXISTS (SELECT 1 FROM public.movimientos_documentales WHERE estado NOT IN
   ('EN_TRASLADO','RECIBIDO','RECHAZADO','CANCELADO')) THEN
  RAISE EXCEPTION 'Existen movimientos incompatibles: revisar datos antes de migrar';
 END IF;
END $$;

-- Propuesta explicita de campos nuevos, sujetos a aprobacion junto con este SQL.
-- El destino decidido se conserva ANTES del traslado. No se crea un movimiento ficticio.
ALTER TABLE public.documentos
 ADD COLUMN destinatario_autorizado_id bigint REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 ADD COLUMN oficina_destino_autorizada_id bigint REFERENCES public.oficinas(id) ON DELETE RESTRICT,
 ADD COLUMN decision_autorizada_por_id bigint REFERENCES public.usuarios(id) ON DELETE RESTRICT;

ALTER TABLE public.documentos DROP CONSTRAINT ck_documentos_estado;
ALTER TABLE public.documentos ALTER COLUMN estado_tramite SET DEFAULT 'RECIBIDO';
ALTER TABLE public.documentos ADD CONSTRAINT ck_documentos_estado CHECK (
 estado_tramite IN ('PENDIENTE_DECISION','EN_TRASLADO','RECIBIDO','RECHAZADO','CANCELADO')
);
-- RECIBIDO sigue siendo custodia confirmada fuera del circuito de decision inicial.
-- Mesa de Partes debe registrar explicitamente PENDIENTE_DECISION.
ALTER TABLE public.documentos ADD CONSTRAINT ck_documentos_anulacion CHECK (
 (activo AND estado_tramite <> 'CANCELADO') OR (NOT activo AND estado_tramite = 'CANCELADO')
);
ALTER TABLE public.documentos ADD CONSTRAINT ck_documentos_destino_autorizado CHECK (
 (destinatario_autorizado_id IS NULL AND oficina_destino_autorizada_id IS NULL AND decision_autorizada_por_id IS NULL)
 OR (destinatario_autorizado_id IS NOT NULL AND oficina_destino_autorizada_id IS NOT NULL
     AND decision_autorizada_por_id IS NOT NULL AND estado_tramite = 'PENDIENTE_DECISION')
);
ALTER TABLE public.documentos ADD CONSTRAINT ck_documentos_ubicacion_confirmada CHECK (
 estado_tramite NOT IN ('EN_TRASLADO','RECHAZADO') OR archivador_id IS NULL
);

ALTER TABLE public.movimientos_documentales DROP CONSTRAINT ck_movimientos_estado;
ALTER TABLE public.movimientos_documentales DROP CONSTRAINT ck_movimientos_resultado;
ALTER TABLE public.movimientos_documentales ALTER COLUMN estado DROP DEFAULT;
ALTER TABLE public.movimientos_documentales ADD CONSTRAINT ck_movimientos_estado CHECK (
 estado IN ('EN_TRASLADO','RECIBIDO','RECHAZADO','CANCELADO')
);
-- Cada movimiento empieza cuando el remitente confirma la salida fisica.
ALTER TABLE public.movimientos_documentales ADD CONSTRAINT ck_movimientos_salida CHECK (
 fecha_salida IS NOT NULL AND trasladado_por_id IS NOT NULL
 AND trasladado_por_id = usuario_origen_id AND registrado_por_id = usuario_origen_id
);
ALTER TABLE public.movimientos_documentales ADD CONSTRAINT ck_movimientos_resultado CHECK (
 (estado = 'EN_TRASLADO'
  AND recibido_por_id IS NULL AND rechazado_por_id IS NULL
  AND devolucion_confirmada_por_id IS NULL AND cancelado_por_id IS NULL
  AND motivo_rechazo IS NULL AND motivo_cancelacion IS NULL)
 OR
 (estado = 'RECIBIDO'
  AND recibido_por_id IS NOT NULL AND recibido_por_id = usuario_destino_id
  AND fecha_recepcion >= fecha_salida AND rechazado_por_id IS NULL
  AND devolucion_confirmada_por_id IS NULL AND cancelado_por_id IS NULL
  AND motivo_rechazo IS NULL AND motivo_cancelacion IS NULL)
 OR
 (estado = 'RECHAZADO'
  AND rechazado_por_id IS NOT NULL AND rechazado_por_id = usuario_destino_id
  AND fecha_rechazo >= fecha_salida AND NULLIF(btrim(motivo_rechazo),'') IS NOT NULL AND motivo_rechazo ~ '[^[:space:]]'
  AND recibido_por_id IS NULL AND cancelado_por_id IS NULL AND motivo_cancelacion IS NULL
  AND (devolucion_confirmada_por_id IS NULL OR fecha_confirmacion_devolucion >= fecha_rechazo))
 OR
 (estado = 'CANCELADO'
  AND cancelado_por_id IS NOT NULL AND cancelado_por_id = usuario_origen_id
  AND NULLIF(btrim(motivo_cancelacion),'') IS NOT NULL AND motivo_cancelacion ~ '[^[:space:]]'
  AND recibido_por_id IS NULL AND rechazado_por_id IS NULL AND motivo_rechazo IS NULL
  AND devolucion_confirmada_por_id IS NOT NULL
  AND devolucion_confirmada_por_id = usuario_origen_id
  AND fecha_confirmacion_devolucion >= fecha_salida
  AND fecha_cancelacion >= fecha_confirmacion_devolucion)
);
-- Se conservan los CHECK existentes de autor de recepcion, rechazo, recuperacion
-- y correspondencia autor/fecha. Una devolucion no confirmada sigue bloqueando otro envio.
DROP INDEX public.uq_movimiento_pendiente_documento;
CREATE UNIQUE INDEX uq_movimiento_pendiente_documento ON public.movimientos_documentales(documento_id)
 WHERE estado = 'EN_TRASLADO' OR (estado = 'RECHAZADO' AND devolucion_confirmada_por_id IS NULL);

-- Los NULL de las comparaciones SQL no deben dejar pasar eventos incompletos.
ALTER TABLE public.movimientos_documentales ADD CONSTRAINT ck_movimientos_fechas_validas CHECK (
 isfinite(fecha_creacion) AND isfinite(fecha_modificacion)
 AND isfinite(fecha_salida)
 AND (fecha_recepcion IS NULL OR isfinite(fecha_recepcion))
 AND (fecha_rechazo IS NULL OR isfinite(fecha_rechazo))
 AND (fecha_confirmacion_devolucion IS NULL OR isfinite(fecha_confirmacion_devolucion))
 AND (fecha_cancelacion IS NULL OR isfinite(fecha_cancelacion))
 AND fecha_modificacion >= fecha_creacion
 AND ((recibido_por_id IS NULL) = (fecha_recepcion IS NULL))
 AND ((rechazado_por_id IS NULL) = (fecha_rechazo IS NULL))
 AND ((devolucion_confirmada_por_id IS NULL) = (fecha_confirmacion_devolucion IS NULL))
 AND ((cancelado_por_id IS NULL) = (fecha_cancelacion IS NULL))
 AND ((rechazado_por_id IS NULL) = (motivo_rechazo IS NULL))
 AND ((cancelado_por_id IS NULL) = (motivo_cancelacion IS NULL))
);

-- El JWT lo valida Express. El contexto de auditoria lo establece el servicio
-- dentro de BEGIN; no se acepta el actor desde el body HTTP.
CREATE FUNCTION public.fn_documental_actor()
RETURNS TABLE(id bigint,rol text,oficina_id bigint,oficina text)
LANGUAGE plpgsql AS $function$
DECLARE actor_txt text;
BEGIN
 actor_txt := nullif(current_setting('app.usuario_actor_id',true),'');
 IF actor_txt IS NULL OR actor_txt !~ '^[1-9][0-9]{0,18}$' THEN
  RAISE EXCEPTION 'Se requiere actor autenticado' USING ERRCODE='23514';
 END IF;
 IF actor_txt::numeric > 9223372036854775807 THEN
  RAISE EXCEPTION 'Actor fuera de rango' USING ERRCODE='23514';
 END IF;
 RETURN QUERY SELECT u.id,r.nombre::text,u.oficina_id,o.nombre::text
 FROM public.usuarios u JOIN public.roles r ON r.id=u.rol_id
 LEFT JOIN public.oficinas o ON o.id=u.oficina_id
 WHERE u.id=actor_txt::bigint AND u.activo FOR SHARE OF u,r;
 IF NOT FOUND THEN RAISE EXCEPTION 'La cuenta no esta activa' USING ERRCODE='23514'; END IF;
END;
$function$;

-- Se ejecuta al autorizar y otra vez al salir. FOR SHARE impide cambiar la
-- oficina/actividad del destinatario antes de terminar la transaccion actual.
-- No se reescriben movimientos historicos si despues cambia la cuenta de oficina.
CREATE FUNCTION public.fn_documental_validar_destino(usuario bigint,oficina bigint)
RETURNS void LANGUAGE plpgsql AS $function$
BEGIN
 PERFORM 1 FROM public.usuarios u
 WHERE u.id=usuario AND u.oficina_id=oficina AND u.activo FOR SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'El destinatario debe estar activo y pertenecer a la oficina autorizada' USING ERRCODE='23514';
 END IF;
END;
$function$;

CREATE FUNCTION public.fn_documental_validar_archivador(archivador bigint,responsable bigint,oficina bigint)
RETURNS void LANGUAGE plpgsql AS $function$
BEGIN
 IF archivador IS NULL THEN RETURN; END IF;
 PERFORM 1 FROM public.archivadores ar JOIN public.estantes e ON e.id=ar.estante_id
 WHERE ar.id=archivador AND e.usuario_id=responsable AND e.oficina_id=oficina FOR SHARE OF ar,e;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'El archivador debe pertenecer al responsable y oficina de custodia' USING ERRCODE='23514';
 END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_documentos_proteger_integridad()
RETURNS trigger LANGUAGE plpgsql AS $function$
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
$function$;
DROP TRIGGER proteger_integridad_documentos ON public.documentos;
CREATE TRIGGER proteger_integridad_documentos BEFORE INSERT OR UPDATE ON public.documentos
 FOR EACH ROW EXECUTE FUNCTION public.fn_documentos_proteger_integridad();

CREATE FUNCTION public.fn_movimientos_validar_salida()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE documento public.documentos%ROWTYPE; actor record; origen_rol text; origen_oficina text;
BEGIN
 SELECT * INTO actor FROM public.fn_documental_actor();
 SELECT * INTO documento FROM public.documentos WHERE id=NEW.documento_id FOR UPDATE;
 IF NOT FOUND OR NOT documento.activo OR NEW.estado<>'EN_TRASLADO'
    OR actor.id IS DISTINCT FROM documento.responsable_actual_id
    OR NEW.usuario_origen_id IS DISTINCT FROM documento.responsable_actual_id
    OR NEW.oficina_origen_id IS DISTINCT FROM documento.oficina_responsable_id
    OR NEW.registrado_por_id IS DISTINCT FROM actor.id OR NEW.trasladado_por_id IS DISTINCT FROM actor.id
    OR NEW.fecha_salida IS NULL OR NOT isfinite(NEW.fecha_salida)
    OR NEW.fecha_salida<documento.fecha_creacion
    -- La salida no antecede a la decision ni a la ultima correccion del documento.
    OR NEW.fecha_salida<documento.fecha_modificacion
    OR NEW.usuario_destino_id=NEW.usuario_origen_id THEN
  RAISE EXCEPTION 'Salida incompatible con el documento y el remitente autenticado' USING ERRCODE='23514';
 END IF;
 PERFORM public.fn_documental_validar_destino(NEW.usuario_destino_id,NEW.oficina_destino_id);
 IF documento.estado_tramite='PENDIENTE_DECISION' THEN
  IF documento.destinatario_autorizado_id IS NULL OR documento.oficina_destino_autorizada_id IS NULL
     OR documento.decision_autorizada_por_id IS NULL
     OR NEW.usuario_destino_id IS DISTINCT FROM documento.destinatario_autorizado_id
     OR NEW.oficina_destino_id IS DISTINCT FROM documento.oficina_destino_autorizada_id
     OR NEW.decidido_por_id IS DISTINCT FROM documento.decision_autorizada_por_id THEN
   RAISE EXCEPTION 'Debe existir autorizacion de Direccion coincidente con el destino' USING ERRCODE='23514';
  END IF;
 ELSIF documento.estado_tramite='RECIBIDO' THEN
  SELECT r.nombre,o.nombre INTO origen_rol,origen_oficina FROM public.usuarios u
   JOIN public.roles r ON r.id=u.rol_id JOIN public.oficinas o ON o.id=documento.oficina_responsable_id
   WHERE u.id=documento.responsable_actual_id;
  IF origen_rol='Secretaria de Dirección' OR origen_oficina='Mesa de Partes' OR NEW.decidido_por_id IS NOT NULL THEN
   RAISE EXCEPTION 'Mesa de Partes requiere el circuito de decision; una derivacion directa no inventa autorizacion' USING ERRCODE='23514';
  END IF;
 ELSE
  RAISE EXCEPTION 'El documento no permite iniciar un traslado' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER validar_salida_movimiento BEFORE INSERT ON public.movimientos_documentales
 FOR EACH ROW EXECUTE FUNCTION public.fn_movimientos_validar_salida();

CREATE OR REPLACE FUNCTION public.fn_movimientos_proteger_historial()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE actor record;
BEGIN
 SELECT * INTO actor FROM public.fn_documental_actor();
 IF ROW(NEW.id,NEW.documento_id,NEW.oficina_origen_id,NEW.usuario_origen_id,
        NEW.oficina_destino_id,NEW.usuario_destino_id,NEW.registrado_por_id,NEW.decidido_por_id,
        NEW.trasladado_por_id,NEW.fecha_salida,NEW.fecha_creacion)
   IS DISTINCT FROM
    ROW(OLD.id,OLD.documento_id,OLD.oficina_origen_id,OLD.usuario_origen_id,
        OLD.oficina_destino_id,OLD.usuario_destino_id,OLD.registrado_por_id,OLD.decidido_por_id,
        OLD.trasladado_por_id,OLD.fecha_salida,OLD.fecha_creacion) THEN
  RAISE EXCEPTION 'Origen, destino, autorizacion y salida historicos son inmutables' USING ERRCODE='23514';
 END IF;
 IF OLD.estado IN ('RECIBIDO','CANCELADO') OR (OLD.estado='RECHAZADO' AND OLD.devolucion_confirmada_por_id IS NOT NULL) THEN
  IF (to_jsonb(NEW)-'fecha_modificacion') IS DISTINCT FROM (to_jsonb(OLD)-'fecha_modificacion') THEN
   RAISE EXCEPTION 'Movimiento cerrado inmutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD.estado='RECHAZADO' THEN
  IF actor.id<>OLD.usuario_origen_id OR NEW.estado<>'RECHAZADO'
     OR NEW.devolucion_confirmada_por_id IS DISTINCT FROM actor.id OR NEW.fecha_confirmacion_devolucion IS NULL
     OR (to_jsonb(NEW)-ARRAY['fecha_modificacion','devolucion_confirmada_por_id','fecha_confirmacion_devolucion'])
       IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['fecha_modificacion','devolucion_confirmada_por_id','fecha_confirmacion_devolucion']) THEN
   RAISE EXCEPTION 'Solo el remitente confirma una vez la recuperacion, conservando el rechazo' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD.estado<>'EN_TRASLADO' OR NEW.estado NOT IN ('RECIBIDO','RECHAZADO','CANCELADO') THEN
  RAISE EXCEPTION 'Transicion de movimiento no permitida' USING ERRCODE='23514';
 END IF;
 IF NEW.estado='RECIBIDO' AND (actor.id<>OLD.usuario_destino_id OR NEW.recibido_por_id IS DISTINCT FROM actor.id
     OR actor.oficina_id IS DISTINCT FROM OLD.oficina_destino_id) THEN
  RAISE EXCEPTION 'Solo el destinatario activo de la oficina de destino confirma recepcion' USING ERRCODE='23514';
 END IF;
 IF NEW.estado='RECHAZADO' AND (actor.id<>OLD.usuario_destino_id OR NEW.rechazado_por_id IS DISTINCT FROM actor.id) THEN
  RAISE EXCEPTION 'Solo el destinatario registra rechazo' USING ERRCODE='23514';
 END IF;
 IF NEW.estado='CANCELADO' AND (actor.id<>OLD.usuario_origen_id OR NEW.cancelado_por_id IS DISTINCT FROM actor.id
     OR NEW.devolucion_confirmada_por_id IS DISTINCT FROM actor.id) THEN
  RAISE EXCEPTION 'Cancelar el traslado requiere recuperacion confirmada por el remitente' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$function$;

-- Se comprueba el estado FINAL de la transaccion. INSERT del movimiento sin UPDATE
-- del documento (o cierre del movimiento sin actualizar custodia) no puede confirmar.
CREATE FUNCTION public.fn_documental_validar_circulacion()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE documento_id_actual bigint; documento public.documentos%ROWTYPE;
        movimiento public.movimientos_documentales%ROWTYPE; ultimo public.movimientos_documentales%ROWTYPE;
        custodio bigint; oficina bigint;
BEGIN
 IF TG_TABLE_NAME='documentos' THEN documento_id_actual:=NEW.id;
 ELSE documento_id_actual:=NEW.documento_id; END IF;
 SELECT * INTO documento FROM public.documentos WHERE id=documento_id_actual FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento inexistente' USING ERRCODE='23514'; END IF;
 SELECT * INTO movimiento FROM public.movimientos_documentales
  WHERE documento_id=documento_id_actual AND (estado='EN_TRASLADO' OR (estado='RECHAZADO' AND devolucion_confirmada_por_id IS NULL));
 IF FOUND THEN
  IF documento.estado_tramite IS DISTINCT FROM movimiento.estado OR NOT documento.activo
     OR documento.responsable_actual_id IS DISTINCT FROM movimiento.usuario_origen_id
     OR documento.oficina_responsable_id IS DISTINCT FROM movimiento.oficina_origen_id
     OR documento.archivador_id IS NOT NULL THEN
   RAISE EXCEPTION 'Movimiento abierto y documento deben confirmarse juntos y conservar custodia de entrega' USING ERRCODE='23514';
  END IF;
 ELSE
  IF documento.estado_tramite IN ('EN_TRASLADO','RECHAZADO') THEN
   RAISE EXCEPTION 'El estado requiere un movimiento abierto correspondiente' USING ERRCODE='23514';
  END IF;
  SELECT * INTO ultimo FROM public.movimientos_documentales WHERE documento_id=documento_id_actual ORDER BY id DESC LIMIT 1;
  IF FOUND THEN
   IF ultimo.estado='RECIBIDO' THEN custodio:=ultimo.usuario_destino_id; oficina:=ultimo.oficina_destino_id;
   ELSE custodio:=ultimo.usuario_origen_id; oficina:=ultimo.oficina_origen_id; END IF;
   IF documento.responsable_actual_id IS DISTINCT FROM custodio OR documento.oficina_responsable_id IS DISTINCT FROM oficina THEN
    RAISE EXCEPTION 'La custodia debe coincidir con la recepcion o recuperacion confirmada' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN NULL;
END;
$function$;
CREATE CONSTRAINT TRIGGER ct_documento_circulacion AFTER INSERT OR UPDATE ON public.documentos
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.fn_documental_validar_circulacion();
CREATE CONSTRAINT TRIGGER ct_movimiento_circulacion AFTER INSERT OR UPDATE ON public.movimientos_documentales
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.fn_documental_validar_circulacion();

-- DECISION es una clase de evento de auditoria, no un estado documental.
CREATE OR REPLACE FUNCTION public.fn_documentos_auditar()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  actor_txt TEXT;
  actor_id BIGINT;
  motivo TEXT;
  restringido BOOLEAN := FALSE;
  antes JSONB := '{}'::jsonb;
  despues JSONB := '{}'::jsonb;
  cambios JSONB := '{}'::jsonb;
  id_doc BIGINT;
  accion_txt VARCHAR(15);
  clase_evento TEXT;
BEGIN
  actor_txt := NULLIF(current_setting('app.usuario_actor_id', TRUE), '');
  IF actor_txt ~ '^[0-9]+$' THEN actor_id := actor_txt::BIGINT; END IF;
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Auditoria documental requiere autor autenticado' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    id_doc := NEW.id;
    despues := to_jsonb(NEW);
    accion_txt := 'CREAR';
    SELECT requiere_clave INTO restringido FROM public.tipos_documentales WHERE id = NEW.tipo_documental_id;
  ELSIF TG_OP = 'UPDATE' THEN
    id_doc := NEW.id;
    antes := to_jsonb(OLD);
    despues := to_jsonb(NEW);
    accion_txt := 'MODIFICAR';
    SELECT requiere_clave INTO restringido FROM public.tipos_documentales WHERE id = NEW.tipo_documental_id;
  ELSE
    RAISE EXCEPTION 'No se permite eliminar fisicamente documentos' USING ERRCODE = '23514';
  END IF;
  IF restringido THEN
    IF TG_OP = 'INSERT' THEN
      cambios := '{"datos_restringidos":true}'::jsonb;
    ELSE
      SELECT COALESCE(jsonb_object_agg(n.key, jsonb_build_object('modificado', true)), '{}'::jsonb)
        INTO cambios
      FROM jsonb_each(despues) n
      LEFT JOIN jsonb_each(antes) a ON a.key = n.key
      WHERE n.key <> 'fecha_modificacion' AND n.value IS DISTINCT FROM a.value;
      IF cambios = '{}'::jsonb THEN RETURN NULL; END IF;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    cambios := despues;
  ELSE
    SELECT COALESCE(jsonb_object_agg(n.key, jsonb_build_object('antes', a.value, 'despues', n.value)), '{}'::jsonb)
      INTO cambios
    FROM jsonb_each(despues) n
    LEFT JOIN jsonb_each(antes) a ON a.key = n.key
    WHERE n.key <> 'fecha_modificacion' AND n.value IS DISTINCT FROM a.value;
    IF cambios = '{}'::jsonb THEN RETURN NULL; END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    motivo := btrim(COALESCE(current_setting('app.motivo_documental', TRUE), ''));
    IF char_length(motivo) NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION 'Motivo obligatorio de 1 a 1000 caracteres'
        USING ERRCODE = '23514';
    END IF;
    clase_evento := CASE WHEN OLD.activo AND NOT NEW.activo THEN 'ANULACION'
      WHEN ROW(OLD.destinatario_autorizado_id,OLD.oficina_destino_autorizada_id,OLD.decision_autorizada_por_id)
        IS DISTINCT FROM ROW(NEW.destinatario_autorizado_id,NEW.oficina_destino_autorizada_id,NEW.decision_autorizada_por_id)
        AND NEW.estado_tramite='PENDIENTE_DECISION' THEN 'DECISION'
      WHEN OLD.estado_tramite IS DISTINCT FROM NEW.estado_tramite
        OR OLD.responsable_actual_id IS DISTINCT FROM NEW.responsable_actual_id
        OR OLD.oficina_responsable_id IS DISTINCT FROM NEW.oficina_responsable_id
        OR OLD.archivador_id IS DISTINCT FROM NEW.archivador_id
        THEN 'MOVIMIENTO' ELSE 'CORRECCION' END;
    IF restringido THEN
      -- No almacenar el motivo en claro en auditoria para documentos reservados.
      cambios := cambios || jsonb_build_object('_evento_documental', jsonb_build_object('tipo', clase_evento));
    ELSE
      cambios := cambios || jsonb_build_object('_evento_documental',
        jsonb_build_object('tipo', clase_evento, 'motivo', motivo));
    END IF;
  END IF;
  INSERT INTO public.historial_modificaciones(tabla, registro_id, accion, usuario_actor_id, campos_modificados)
  VALUES ('documentos', id_doc, accion_txt, actor_id, cambios);
  RETURN NULL;
END;
$function$;

-- Prevalidar coherencia existente: los triggers diferidos no inspeccionan filas
-- antiguas por si solos. No modificar filas para dispararlos ni convertir estados.
DO $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM public.documentos d WHERE
   (d.estado_tramite IN ('EN_TRASLADO','RECHAZADO') AND NOT EXISTS (
    SELECT 1 FROM public.movimientos_documentales m WHERE m.documento_id=d.id AND m.estado=d.estado_tramite
     AND (m.estado='EN_TRASLADO' OR (m.estado='RECHAZADO' AND m.devolucion_confirmada_por_id IS NULL))
     AND m.usuario_origen_id=d.responsable_actual_id AND m.oficina_origen_id=d.oficina_responsable_id))
   OR EXISTS (SELECT 1 FROM public.movimientos_documentales m WHERE m.documento_id=d.id
    AND (m.estado='EN_TRASLADO' OR (m.estado='RECHAZADO' AND m.devolucion_confirmada_por_id IS NULL))
    AND (m.estado<>d.estado_tramite OR NOT d.activo OR m.usuario_origen_id<>d.responsable_actual_id
         OR m.oficina_origen_id<>d.oficina_responsable_id))
 ) THEN RAISE EXCEPTION 'Datos existentes incompatibles con custodia y movimientos: revisar sin convertir'; END IF;
 IF EXISTS (
  SELECT 1 FROM public.documentos d JOIN LATERAL (
   SELECT m.* FROM public.movimientos_documentales m WHERE m.documento_id=d.id ORDER BY m.id DESC LIMIT 1
  ) ultimo ON true
  WHERE NOT EXISTS (SELECT 1 FROM public.movimientos_documentales abierto WHERE abierto.documento_id=d.id
    AND (abierto.estado='EN_TRASLADO' OR (abierto.estado='RECHAZADO' AND abierto.devolucion_confirmada_por_id IS NULL)))
  AND ROW(d.responsable_actual_id,d.oficina_responsable_id) IS DISTINCT FROM ROW(
   CASE WHEN ultimo.estado='RECIBIDO' THEN ultimo.usuario_destino_id ELSE ultimo.usuario_origen_id END,
   CASE WHEN ultimo.estado='RECIBIDO' THEN ultimo.oficina_destino_id ELSE ultimo.oficina_origen_id END)
 ) THEN RAISE EXCEPTION 'La custodia existente no coincide con el ultimo movimiento cerrado: revisar sin convertir'; END IF;
END $$;
-- Sin UPDATE/DELETE de conversion, sin modificar correlativos ni el generador.
-- Todo cambio de estructura se revierte si falla cualquier comprobacion.
COMMIT;
