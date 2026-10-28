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
