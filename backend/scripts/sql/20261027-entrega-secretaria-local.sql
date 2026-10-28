-- Asignación y entrega aprobadas; conserva documentos y movimientos anteriores.
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
CREATE TABLE public.entregas_secretaria (
 documento_id bigint PRIMARY KEY REFERENCES documentos(id),
 situacion text NOT NULL DEFAULT 'PENDIENTE_ASIGNACION' CHECK(situacion IN ('PENDIENTE_ASIGNACION','PENDIENTE_ENTREGA','ENTREGADO')),
 tipo text CHECK(tipo IN ('OFICINA','USUARIO','PERSONA')),
 oficina_id bigint REFERENCES oficinas(id), usuario_id bigint REFERENCES usuarios(id), destinatario text,
 asignado_por_id bigint REFERENCES usuarios(id), asignado_por_nombre text, asignado_en timestamptz,
 confirmado_por_id bigint REFERENCES usuarios(id), confirmado_por_nombre text, confirmado_en timestamptz,
 revision integer NOT NULL DEFAULT 0,
 CHECK ((situacion='PENDIENTE_ASIGNACION' AND destinatario IS NULL AND asignado_en IS NULL) OR
 (situacion IN ('PENDIENTE_ENTREGA','ENTREGADO') AND length(destinatario)>0 AND asignado_por_id IS NOT NULL AND asignado_en IS NOT NULL)),
 CHECK ((situacion='ENTREGADO')=(confirmado_en IS NOT NULL)),
 CHECK (situacion<>'ENTREGADO' OR confirmado_por_id IS NOT NULL)
);
CREATE TABLE public.entregas_secretaria_historial (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, documento_id bigint NOT NULL REFERENCES documentos(id),
 evento text NOT NULL, actor text NOT NULL, destinatario text, fecha timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION public.fn_entrega_secretaria_guardar() RETURNS trigger LANGUAGE plpgsql AS $f$
DECLARE actor_id bigint := nullif(current_setting('app.usuario_actor_id',true),'')::bigint; rol text; autor bigint; nombre_actor text;
BEGIN
 SELECT r.nombre,concat_ws(' ',u.nombre,u.apellido) INTO rol,nombre_actor FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.id=actor_id AND u.activo;
 SELECT registrado_por_id INTO autor FROM documentos WHERE id=NEW.documento_id FOR UPDATE;
 IF TG_OP='INSERT' THEN
  IF rol IS DISTINCT FROM 'Secretaria de Dirección' OR actor_id IS DISTINCT FROM autor OR NEW.situacion<>'PENDIENTE_ASIGNACION' THEN RAISE EXCEPTION 'Registro de flujo no autorizado' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.situacion='ENTREGADO' OR NEW.documento_id<>OLD.documento_id OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Entrega inmutable o revisión incompatible' USING ERRCODE='23514'; END IF;
  IF NEW.situacion='PENDIENTE_ENTREGA' THEN
   IF rol IS DISTINCT FROM 'Director(a)' OR NEW.asignado_por_id IS DISTINCT FROM actor_id THEN RAISE EXCEPTION 'Asignación no autorizada' USING ERRCODE='23514'; END IF;
  ELSIF NEW.situacion='ENTREGADO' THEN
   IF rol IS DISTINCT FROM 'Secretaria de Dirección' OR actor_id IS DISTINCT FROM autor OR OLD.situacion<>'PENDIENTE_ENTREGA' OR NEW.confirmado_por_id IS DISTINCT FROM actor_id OR
    (to_jsonb(NEW)-ARRAY['situacion','confirmado_por_id','confirmado_por_nombre','confirmado_en','revision']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['situacion','confirmado_por_id','confirmado_por_nombre','confirmado_en','revision']) THEN RAISE EXCEPTION 'Confirmación no autorizada' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'Transición no permitida' USING ERRCODE='23514'; END IF;
 END IF;
 INSERT INTO entregas_secretaria_historial(documento_id,evento,actor,destinatario) VALUES(NEW.documento_id,CASE WHEN TG_OP='INSERT' THEN 'Registro' WHEN NEW.situacion='ENTREGADO' THEN 'Entrega confirmada' ELSE 'Asignación' END,nombre_actor,NEW.destinatario);
 RETURN NEW;
END;$f$;
CREATE TRIGGER entregas_secretaria_guardar BEFORE INSERT OR UPDATE ON entregas_secretaria FOR EACH ROW EXECUTE FUNCTION fn_entrega_secretaria_guardar();
GRANT SELECT,INSERT,UPDATE ON entregas_secretaria TO sistema_web_app;
GRANT SELECT,INSERT ON entregas_secretaria_historial TO sistema_web_app;
GRANT USAGE,SELECT ON SEQUENCE entregas_secretaria_historial_id_seq TO sistema_web_app;
-- Habilita el flujo para antecedentes sin inventar asignaciones ni entregas.
-- No modifica documentos ni movimientos ni sus auditorías.
ALTER TABLE entregas_secretaria DISABLE TRIGGER entregas_secretaria_guardar;
INSERT INTO entregas_secretaria(documento_id)
 SELECT d.id FROM documentos d JOIN usuarios u ON u.id=d.registrado_por_id
 JOIN roles r ON r.id=u.rol_id JOIN tipos_documentales t ON t.id=d.tipo_documental_id
 WHERE r.nombre='Secretaria de Dirección' AND NOT t.requiere_clave AND lower(btrim(t.nombre))<>'síseve'
 ON CONFLICT DO NOTHING;
ALTER TABLE entregas_secretaria ENABLE TRIGGER entregas_secretaria_guardar;
-- La aplicación solo lee el historial; el trigger escribe bajo su propietario.
ALTER FUNCTION fn_entrega_secretaria_guardar() SECURITY DEFINER;
ALTER FUNCTION fn_entrega_secretaria_guardar() SET search_path=pg_catalog,public;
REVOKE INSERT ON entregas_secretaria_historial FROM sistema_web_app;
REVOKE USAGE ON SEQUENCE entregas_secretaria_historial_id_seq FROM sistema_web_app;
CREATE FUNCTION fn_entrega_destino_coherente() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
 IF NEW.situacion='PENDIENTE_ENTREGA' THEN
  IF NEW.tipo IS NULL OR (NEW.tipo='PERSONA' AND (NEW.oficina_id IS NOT NULL OR NEW.usuario_id IS NOT NULL))
   OR (NEW.tipo='OFICINA' AND NEW.oficina_id IS NULL) OR (NEW.tipo='USUARIO' AND NEW.usuario_id IS NULL)
   OR (NEW.usuario_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM usuarios u WHERE u.id=NEW.usuario_id AND u.activo AND (NEW.oficina_id IS NULL OR u.oficina_id=NEW.oficina_id))) THEN
   RAISE EXCEPTION 'Destinatario incoherente' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;$f$;
CREATE TRIGGER aa_entrega_destino_coherente BEFORE INSERT OR UPDATE ON entregas_secretaria FOR EACH ROW EXECUTE FUNCTION fn_entrega_destino_coherente();
