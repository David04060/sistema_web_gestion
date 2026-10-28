-- Estructura final del flujo vigente. No se convierten movimientos históricos.
CREATE TABLE public.entregas_secretaria (
 documento_id bigint PRIMARY KEY REFERENCES documentos(id),
 situacion text NOT NULL DEFAULT 'PENDIENTE_DECISION',
 tipo text, oficina_id bigint REFERENCES oficinas(id), usuario_id bigint REFERENCES usuarios(id), destinatario text,
 asignado_por_id bigint REFERENCES usuarios(id), asignado_por_nombre text, asignado_en timestamptz,
 confirmado_por_id bigint REFERENCES usuarios(id), confirmado_por_nombre text, confirmado_en timestamptz,
 revision integer NOT NULL DEFAULT 0,
 observaciones_direccion text, estante_direccion_id bigint REFERENCES estantes(id),
 archivador_direccion_id bigint REFERENCES archivadores(id), ubicacion_direccion text
);
CREATE TABLE public.entregas_secretaria_historial (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, documento_id bigint NOT NULL REFERENCES documentos(id),
 evento text NOT NULL, actor text NOT NULL, destinatario text, fecha timestamptz NOT NULL DEFAULT clock_timestamp(), observaciones text, ubicacion text
);
ALTER TABLE entregas_secretaria ADD CONSTRAINT ck_entrega_situacion CHECK(situacion IN ('PENDIENTE_DECISION','DELEGADO','ENTREGADO','GUARDADO_DIRECCION','GUARDADO_SECRETARIA')),
 ADD CONSTRAINT ck_entrega_decision CHECK(
 (situacion='PENDIENTE_DECISION' AND destinatario IS NULL AND asignado_en IS NULL AND archivador_direccion_id IS NULL) OR
 (situacion IN ('DELEGADO','ENTREGADO') AND length(destinatario)>0 AND asignado_por_id IS NOT NULL AND asignado_en IS NOT NULL AND archivador_direccion_id IS NULL) OR
 (situacion IN ('GUARDADO_DIRECCION','GUARDADO_SECRETARIA') AND destinatario IS NULL AND asignado_por_id IS NOT NULL AND asignado_en IS NOT NULL AND estante_direccion_id IS NOT NULL AND archivador_direccion_id IS NOT NULL AND ubicacion_direccion IS NOT NULL)),
 ADD CONSTRAINT ck_entrega_confirmacion CHECK((situacion='ENTREGADO')=(confirmado_en IS NOT NULL) AND (situacion<>'ENTREGADO' OR confirmado_por_id IS NOT NULL));

CREATE OR REPLACE FUNCTION fn_entrega_secretaria_guardar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE actor_id bigint := nullif(current_setting('app.usuario_actor_id',true),'')::bigint; rol text; autor bigint; nombre_actor text; oficina_actor bigint; evento text; rol_autor text;
BEGIN
 SELECT r.nombre,concat_ws(' ',u.nombre,u.apellido),u.oficina_id INTO rol,nombre_actor,oficina_actor FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.id=actor_id AND u.activo;
 SELECT d.registrado_por_id,r.nombre INTO autor,rol_autor FROM documentos d JOIN usuarios u ON u.id=d.registrado_por_id JOIN roles r ON r.id=u.rol_id JOIN tipos_documentales td ON td.id=d.tipo_documental_id WHERE d.id=NEW.documento_id AND NOT td.requiere_clave AND lower(btrim(td.nombre))<>'síseve' FOR UPDATE OF d;
 IF rol_autor IS NULL OR rol_autor NOT IN ('Secretaria de Dirección','Director(a)') THEN RAISE EXCEPTION 'Registro fuera del flujo ordinario' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF (rol IS NULL OR rol NOT IN ('Secretaria de Dirección','Director(a)')) OR actor_id IS DISTINCT FROM autor OR NEW.situacion<>'PENDIENTE_DECISION' THEN RAISE EXCEPTION 'Registro no autorizado' USING ERRCODE='23514'; END IF;
  evento:='Registro';
 ELSE
  IF NEW.documento_id<>OLD.documento_id OR NEW.revision<>OLD.revision+1 OR OLD.situacion IN ('ENTREGADO','GUARDADO_DIRECCION','GUARDADO_SECRETARIA') THEN RAISE EXCEPTION 'Recorrido finalizado o revisión incompatible' USING ERRCODE='23514'; END IF;
  IF NEW.situacion IN ('DELEGADO','GUARDADO_DIRECCION','GUARDADO_SECRETARIA') THEN
   IF OLD.situacion<>'PENDIENTE_DECISION' OR (rol IS NULL OR rol NOT IN ('Director(a)','Secretaria de Dirección')) OR (rol='Secretaria de Dirección' AND actor_id IS DISTINCT FROM autor AND rol_autor IS DISTINCT FROM 'Director(a)') OR NEW.asignado_por_id IS DISTINCT FROM actor_id OR (rol='Director(a)' AND rol_autor='Director(a)' AND actor_id IS DISTINCT FROM autor) THEN RAISE EXCEPTION 'Decisión no autorizada o ya registrada' USING ERRCODE='23514'; END IF;
   IF NEW.situacion IN ('GUARDADO_DIRECCION','GUARDADO_SECRETARIA') AND ((NEW.situacion='GUARDADO_SECRETARIA') IS DISTINCT FROM (rol='Secretaria de Dirección') OR NOT EXISTS(SELECT 1 FROM archivadores a JOIN estantes e ON e.id=a.estante_id JOIN oficinas o ON o.id=e.oficina_id WHERE a.id=NEW.archivador_direccion_id AND e.id=NEW.estante_direccion_id AND e.oficina_id=oficina_actor AND (rol='Secretaria de Dirección' OR o.nombre='Dirección'))) THEN RAISE EXCEPTION 'Ubicación ajena a Dirección' USING ERRCODE='23514'; END IF;
   evento:=CASE NEW.situacion WHEN 'DELEGADO' THEN 'Delegación' WHEN 'GUARDADO_SECRETARIA' THEN 'Guardado en Secretaría' ELSE 'Guardado en Dirección' END;
  ELSIF NEW.situacion='ENTREGADO' THEN
   IF OLD.situacion<>'DELEGADO' OR rol IS DISTINCT FROM 'Secretaria de Dirección' OR (actor_id IS DISTINCT FROM autor AND rol_autor IS DISTINCT FROM 'Director(a)') OR NEW.confirmado_por_id IS DISTINCT FROM actor_id OR
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

-- Solo situación sin decisión para antecedentes; sin destino, ubicación nueva ni eventos inventados.
INSERT INTO entregas_secretaria(documento_id)
 SELECT d.id FROM documentos d JOIN usuarios u ON u.id=d.registrado_por_id JOIN roles r ON r.id=u.rol_id
 JOIN tipos_documentales td ON td.id=d.tipo_documental_id
 WHERE r.nombre IN ('Secretaria de Dirección','Director(a)') AND NOT td.requiere_clave AND lower(btrim(td.nombre))<>'síseve';
CREATE TRIGGER entregas_secretaria_guardar BEFORE INSERT OR UPDATE ON entregas_secretaria FOR EACH ROW EXECUTE FUNCTION fn_entrega_secretaria_guardar();
CREATE TRIGGER aa_entrega_destino_coherente BEFORE INSERT OR UPDATE ON entregas_secretaria FOR EACH ROW EXECUTE FUNCTION fn_entrega_destino_coherente();
GRANT SELECT,INSERT,UPDATE ON entregas_secretaria TO sistema_web_app;
GRANT SELECT ON entregas_secretaria_historial TO sistema_web_app;
REVOKE ALL ON SEQUENCE entregas_secretaria_historial_id_seq FROM sistema_web_app;
REVOKE ALL ON FUNCTION fn_entrega_secretaria_guardar() FROM PUBLIC;
