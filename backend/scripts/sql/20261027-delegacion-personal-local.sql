DO $$ BEGIN
 IF current_database()<>'sistema_web_final' OR inet_server_addr()::text NOT IN ('127.0.0.1/32','::1/128') OR current_schema()<>'public' OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL THEN
 RAISE EXCEPTION 'Se requiere sistema_web_final local'; END IF;
END $$;
CREATE TABLE delegaciones_personales (
 documento_id bigint PRIMARY KEY REFERENCES documentos(id) ON DELETE RESTRICT,
 oficina_id bigint REFERENCES oficinas(id) ON DELETE RESTRICT,
 usuario_id bigint REFERENCES usuarios(id) ON DELETE RESTRICT,
 oficina_nombre text,
 persona_nombre text,
 destinatario text NOT NULL CHECK(length(btrim(destinatario))>0),
 actor_id bigint NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 actor_nombre text NOT NULL,
 registrada_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(oficina_nombre IS NOT NULL OR persona_nombre IS NOT NULL)
);
CREATE FUNCTION fn_delegacion_personal_guardar() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE actor bigint:=nullif(current_setting('app.usuario_actor_id',true),'')::bigint;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'La delegación personal es un antecedente inmutable' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM documentos d JOIN usuarios u ON u.id=d.registrado_por_id JOIN roles r ON r.id=u.rol_id JOIN tipos_documentales td ON td.id=d.tipo_documental_id WHERE d.id=NEW.documento_id AND d.activo AND u.activo AND r.nombre='Usuario' AND u.id=actor AND NEW.actor_id=actor AND NOT td.requiere_clave AND lower(btrim(td.nombre))<>'síseve' FOR UPDATE OF d) THEN RAISE EXCEPTION 'Delegación personal no autorizada' USING ERRCODE='23514'; END IF;
 IF NEW.usuario_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM usuarios u WHERE u.id=NEW.usuario_id AND u.activo AND (NEW.oficina_id IS NULL OR u.oficina_id=NEW.oficina_id)) THEN RAISE EXCEPTION 'Oficina y usuario incompatibles' USING ERRCODE='23514'; END IF;
 NEW.registrada_en:=clock_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER delegacion_personal_guardar BEFORE INSERT OR UPDATE OR DELETE ON delegaciones_personales FOR EACH ROW EXECUTE FUNCTION fn_delegacion_personal_guardar();
