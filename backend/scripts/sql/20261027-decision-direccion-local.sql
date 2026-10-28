DO $guarda$
BEGIN
 IF current_database()<>'sistema_web_final'
 OR inet_server_addr()::text NOT IN ('127.0.0.1/32','::1/128')
 OR current_schema()<>'public'
 OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL
 OR to_regclass('public.archivos_institucionales') IS NOT NULL THEN
  RAISE EXCEPTION 'La migración requiere sistema_web_final local, esquema public y sin integración descartada';
 END IF;
END;
$guarda$;
ALTER TABLE entregas_secretaria ADD COLUMN observaciones_direccion text,
 ADD COLUMN estante_direccion_id bigint REFERENCES estantes(id),
 ADD COLUMN archivador_direccion_id bigint REFERENCES archivadores(id),
 ADD COLUMN ubicacion_direccion text;
ALTER TABLE entregas_secretaria_historial ADD COLUMN observaciones text, ADD COLUMN ubicacion text;
ALTER TABLE entregas_secretaria DISABLE TRIGGER entregas_secretaria_guardar;
ALTER TABLE entregas_secretaria DISABLE TRIGGER aa_entrega_destino_coherente;
ALTER TABLE entregas_secretaria DROP CONSTRAINT entregas_secretaria_situacion_check,
 DROP CONSTRAINT entregas_secretaria_tipo_check, DROP CONSTRAINT entregas_secretaria_check,
 DROP CONSTRAINT entregas_secretaria_check1, DROP CONSTRAINT entregas_secretaria_check2;
UPDATE entregas_secretaria SET situacion=CASE situacion WHEN 'PENDIENTE_ASIGNACION' THEN 'PENDIENTE_DECISION' WHEN 'PENDIENTE_ENTREGA' THEN 'DELEGADO' ELSE situacion END;
ALTER TABLE entregas_secretaria ALTER COLUMN situacion SET DEFAULT 'PENDIENTE_DECISION';
ALTER TABLE entregas_secretaria ADD CONSTRAINT ck_entrega_situacion CHECK(situacion IN ('PENDIENTE_DECISION','DELEGADO','ENTREGADO','GUARDADO_DIRECCION')),
 ADD CONSTRAINT ck_entrega_decision CHECK(
 (situacion='PENDIENTE_DECISION' AND destinatario IS NULL AND asignado_en IS NULL AND archivador_direccion_id IS NULL) OR
 (situacion IN ('DELEGADO','ENTREGADO') AND length(destinatario)>0 AND asignado_por_id IS NOT NULL AND asignado_en IS NOT NULL AND archivador_direccion_id IS NULL) OR
 (situacion='GUARDADO_DIRECCION' AND destinatario IS NULL AND asignado_por_id IS NOT NULL AND asignado_en IS NOT NULL AND estante_direccion_id IS NOT NULL AND archivador_direccion_id IS NOT NULL AND ubicacion_direccion IS NOT NULL)),
 ADD CONSTRAINT ck_entrega_confirmacion CHECK((situacion='ENTREGADO')=(confirmado_en IS NOT NULL) AND (situacion<>'ENTREGADO' OR confirmado_por_id IS NOT NULL));
CREATE OR REPLACE FUNCTION fn_entrega_secretaria_guardar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE actor_id bigint := nullif(current_setting('app.usuario_actor_id',true),'')::bigint; rol text; autor bigint; nombre_actor text; oficina_actor bigint; evento text;
BEGIN
 SELECT r.nombre,concat_ws(' ',u.nombre,u.apellido),u.oficina_id INTO rol,nombre_actor,oficina_actor FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.id=actor_id AND u.activo;
 SELECT registrado_por_id INTO autor FROM documentos WHERE id=NEW.documento_id FOR UPDATE;
 IF TG_OP='INSERT' THEN
  IF rol IS DISTINCT FROM 'Secretaria de Dirección' OR actor_id IS DISTINCT FROM autor OR NEW.situacion<>'PENDIENTE_DECISION' THEN RAISE EXCEPTION 'Registro no autorizado' USING ERRCODE='23514'; END IF;
  evento:='Registro';
 ELSE
  IF NEW.documento_id<>OLD.documento_id OR NEW.revision<>OLD.revision+1 OR OLD.situacion IN ('ENTREGADO','GUARDADO_DIRECCION') THEN RAISE EXCEPTION 'Recorrido finalizado o revisión incompatible' USING ERRCODE='23514'; END IF;
  IF NEW.situacion IN ('DELEGADO','GUARDADO_DIRECCION') THEN
   IF OLD.situacion<>'PENDIENTE_DECISION' OR rol IS DISTINCT FROM 'Director(a)' OR NEW.asignado_por_id IS DISTINCT FROM actor_id THEN RAISE EXCEPTION 'Decisión no autorizada o ya registrada' USING ERRCODE='23514'; END IF;
   IF NEW.situacion='GUARDADO_DIRECCION' AND NOT EXISTS(SELECT 1 FROM archivadores a JOIN estantes e ON e.id=a.estante_id JOIN oficinas o ON o.id=e.oficina_id WHERE a.id=NEW.archivador_direccion_id AND e.id=NEW.estante_direccion_id AND e.oficina_id=oficina_actor AND o.nombre='Dirección') THEN RAISE EXCEPTION 'Ubicación ajena a Dirección' USING ERRCODE='23514'; END IF;
   evento:=CASE NEW.situacion WHEN 'DELEGADO' THEN 'Delegación' ELSE 'Guardado en Dirección' END;
  ELSIF NEW.situacion='ENTREGADO' THEN
   IF OLD.situacion<>'DELEGADO' OR rol IS DISTINCT FROM 'Secretaria de Dirección' OR actor_id IS DISTINCT FROM autor OR NEW.confirmado_por_id IS DISTINCT FROM actor_id OR
    (to_jsonb(NEW)-ARRAY['situacion','confirmado_por_id','confirmado_por_nombre','confirmado_en','revision']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['situacion','confirmado_por_id','confirmado_por_nombre','confirmado_en','revision']) THEN RAISE EXCEPTION 'Confirmación no autorizada' USING ERRCODE='23514'; END IF;
   evento:='Entrega confirmada';
  ELSE RAISE EXCEPTION 'Transición no permitida' USING ERRCODE='23514'; END IF;
 END IF;
 INSERT INTO entregas_secretaria_historial(documento_id,evento,actor,destinatario,observaciones,ubicacion) VALUES(NEW.documento_id,evento,nombre_actor,NEW.destinatario,NEW.observaciones_direccion,NEW.ubicacion_direccion);
 RETURN NEW;
END;$f$;
CREATE OR REPLACE FUNCTION fn_entrega_destino_coherente() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
 IF NEW.situacion='DELEGADO' THEN
  IF (NEW.oficina_id IS NULL AND NEW.usuario_id IS NULL AND nullif(btrim(NEW.destinatario),'') IS NULL)
   OR (NEW.usuario_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM usuarios u WHERE u.id=NEW.usuario_id AND u.activo AND (NEW.oficina_id IS NULL OR u.oficina_id=NEW.oficina_id))) THEN RAISE EXCEPTION 'Destinatario incoherente' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END;$f$;
ALTER TABLE entregas_secretaria ENABLE TRIGGER entregas_secretaria_guardar;
ALTER TABLE entregas_secretaria ENABLE TRIGGER aa_entrega_destino_coherente;
