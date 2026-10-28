CREATE TABLE public.documentos_relaciones (
 documento_id bigint PRIMARY KEY REFERENCES documentos(id) ON DELETE RESTRICT,
 documento_origen_id bigint NOT NULL REFERENCES documentos(id) ON DELETE RESTRICT,
 creado_por_id bigint NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 creado_por_nombre text NOT NULL,
 creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT ck_relacion_distinta CHECK(documento_id<>documento_origen_id)
);
CREATE INDEX ix_documentos_relaciones_origen ON documentos_relaciones(documento_origen_id);
CREATE FUNCTION fn_documentos_relaciones_auditar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE actor bigint:=nullif(current_setting('app.usuario_actor_id',true),'')::bigint; nombre_actor text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'La relación histórica no se modifica ni elimina' USING ERRCODE='23514'; END IF;
 SELECT concat_ws(' ',u.nombre,u.apellido) INTO nombre_actor FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.id=actor AND u.activo AND r.nombre='Secretaria de Dirección';
 IF nombre_actor IS NULL OR NOT EXISTS(
  SELECT 1 FROM documentos nuevo JOIN usuarios u ON u.id=nuevo.registrado_por_id JOIN roles r ON r.id=u.rol_id
  JOIN tipos_documentales tn ON tn.id=nuevo.tipo_documental_id
  JOIN documentos origen ON origen.id=NEW.documento_origen_id JOIN usuarios a ON a.id=origen.registrado_por_id
  JOIN roles ra ON ra.id=a.rol_id JOIN tipos_documentales tor ON tor.id=origen.tipo_documental_id
  WHERE nuevo.id=NEW.documento_id AND nuevo.registrado_por_id=actor
   AND r.nombre='Secretaria de Dirección' AND ra.nombre='Secretaria de Dirección'
   AND NOT tn.requiere_clave AND NOT tor.requiere_clave
   AND lower(btrim(tn.nombre))<>'síseve' AND lower(btrim(tor.nombre))<>'síseve') THEN
  RAISE EXCEPTION 'Relación inexistente, restringida o no autorizada' USING ERRCODE='23514';
 END IF;
 IF EXISTS(WITH RECURSIVE antecedentes(id) AS (
  SELECT NEW.documento_origen_id UNION SELECT v.documento_origen_id FROM documentos_relaciones v JOIN antecedentes a ON a.id=v.documento_id
 ) SELECT 1 FROM antecedentes WHERE id=NEW.documento_id) THEN RAISE EXCEPTION 'Relación circular no permitida' USING ERRCODE='23514'; END IF;
 NEW.creado_por_id:=actor;NEW.creado_por_nombre:=nombre_actor;NEW.creado_en:=clock_timestamp();
 INSERT INTO historial_modificaciones(tabla,registro_id,accion,usuario_actor_id,campos_modificados)
 VALUES('documentos_relaciones',NEW.documento_id,'CREAR',actor,jsonb_build_object('Documento de origen',NEW.documento_origen_id));
 RETURN NEW;
END;$f$;
CREATE TRIGGER documentos_relaciones_auditar BEFORE INSERT OR UPDATE OR DELETE ON documentos_relaciones FOR EACH ROW EXECUTE FUNCTION fn_documentos_relaciones_auditar();
GRANT SELECT,INSERT ON documentos_relaciones TO sistema_web_app;

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

GRANT SELECT,INSERT ON delegaciones_personales TO sistema_web_app;
REVOKE ALL ON FUNCTION fn_documentos_relaciones_auditar() FROM PUBLIC;
