BEGIN;
SET LOCAL search_path=public;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM usuarios WHERE activo AND oficina_id IS NOT NULL GROUP BY oficina_id HAVING count(*)>1) THEN RAISE EXCEPTION 'Varias cuentas activas por oficina'; END IF;
END $$;
CREATE UNIQUE INDEX usuarios_oficina_activa_unica ON usuarios(oficina_id) WHERE activo AND oficina_id IS NOT NULL;
CREATE TABLE oficina_periodos(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,oficina_id bigint NOT NULL REFERENCES oficinas(id),
 usuario_id bigint NOT NULL REFERENCES usuarios(id),inicio timestamptz NOT NULL DEFAULT clock_timestamp(),fin timestamptz,
 CHECK(fin IS NULL OR fin>=inicio));
CREATE UNIQUE INDEX oficina_periodo_abierto ON oficina_periodos(oficina_id) WHERE fin IS NULL;
CREATE UNIQUE INDEX usuario_periodo_abierto ON oficina_periodos(usuario_id) WHERE fin IS NULL;
CREATE INDEX oficina_periodos_usuario ON oficina_periodos(usuario_id,oficina_id);
-- Reconstruye la procedencia con eventos de oficina auditados antes de enlazar registros.
CREATE TEMP TABLE relevo_movimientos ON COMMIT DROP AS
 SELECT h.entidad_id usuario_id,h.fecha,h.id,
  (h.anterior->>'oficina_id')::bigint anterior,(h.posterior->>'oficina_id')::bigint posterior
 FROM auditoria_configuracion h
 WHERE h.entidad='USUARIO' AND h.anterior ? 'oficina_id' AND h.posterior ? 'oficina_id'
  AND h.anterior->>'oficina_id' IS DISTINCT FROM h.posterior->>'oficina_id';
DO $cronologia$ BEGIN
 IF EXISTS(
  SELECT 1 FROM (
   SELECT m.*,row_number() OVER w posicion,lag(posterior) OVER w previo,
    row_number() OVER(PARTITION BY usuario_id ORDER BY fecha DESC,id DESC) ultimo
   FROM relevo_movimientos m WINDOW w AS(PARTITION BY usuario_id ORDER BY fecha,id)
  ) m JOIN usuarios u ON u.id=m.usuario_id
  WHERE (posicion>1 AND previo IS DISTINCT FROM anterior)
     OR (ultimo=1 AND posterior IS DISTINCT FROM u.oficina_id)
 ) THEN RAISE EXCEPTION 'La secuencia auditada de oficina no coincide con la asignación'; END IF;
END $cronologia$;
INSERT INTO oficina_periodos(oficina_id,usuario_id,inicio,fin)
 SELECT anterior,usuario_id,inicio,fecha FROM (
  SELECT m.*,lag(fecha,1,'-infinity'::timestamptz) OVER(PARTITION BY usuario_id ORDER BY fecha,id) inicio
  FROM relevo_movimientos m
 ) m WHERE anterior IS NOT NULL;
INSERT INTO oficina_periodos(oficina_id,usuario_id,inicio,fin)
 SELECT oficina_id,id,coalesce((SELECT max(fecha) FROM relevo_movimientos m WHERE m.usuario_id=u.id),'-infinity'::timestamptz),
 CASE WHEN activo THEN NULL ELSE clock_timestamp() END FROM usuarios u WHERE oficina_id IS NOT NULL;
CREATE TABLE documentos_oficina(documento_id bigint PRIMARY KEY REFERENCES documentos(id),periodo_id bigint NOT NULL REFERENCES oficina_periodos(id));
INSERT INTO documentos_oficina
 SELECT d.id,p.id FROM documentos d JOIN oficina_periodos p ON p.usuario_id=d.registrado_por
 AND d.creado_en>=p.inicio AND (p.fin IS NULL OR d.creado_en<p.fin);
CREATE INDEX documentos_oficina_periodo ON documentos_oficina(periodo_id);
CREATE FUNCTION sincronizar_periodo_oficina() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (NEW.activo,NEW.oficina_id) IS NOT DISTINCT FROM (OLD.activo,OLD.oficina_id) THEN RETURN NULL; END IF;
  UPDATE public.oficina_periodos SET fin=clock_timestamp() WHERE usuario_id=NEW.id AND fin IS NULL;
 END IF;
 IF NEW.activo AND NEW.oficina_id IS NOT NULL THEN
  INSERT INTO public.oficina_periodos(oficina_id,usuario_id) VALUES(NEW.oficina_id,NEW.id);
  INSERT INTO public.tipos_oficina(tipo_id,oficina_id)
   SELECT id,NEW.oficina_id FROM public.tipos_documentales WHERE creado_por=NEW.id
   ON CONFLICT (tipo_id) DO NOTHING;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER sincronizar_periodo_oficina AFTER INSERT OR UPDATE OF activo,oficina_id ON usuarios FOR EACH ROW EXECUTE FUNCTION sincronizar_periodo_oficina();
CREATE FUNCTION registrar_oficina_documento() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.documentos_oficina(documento_id,periodo_id) SELECT NEW.id,p.id FROM public.oficina_periodos p
 JOIN public.usuarios u ON u.id=p.usuario_id AND u.activo AND u.oficina_id=p.oficina_id WHERE p.usuario_id=NEW.registrado_por AND p.fin IS NULL;
 RETURN NULL;
END $$;
CREATE TRIGGER z_registrar_oficina_documento AFTER INSERT ON documentos FOR EACH ROW EXECUTE FUNCTION registrar_oficina_documento();
CREATE FUNCTION documento_periodo_cerrado(doc bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.documentos_oficina o JOIN public.oficina_periodos p ON p.id=o.periodo_id WHERE o.documento_id=doc AND p.fin IS NOT NULL)
$$;
CREATE FUNCTION documento_consultable(actor bigint,doc bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.documentos d JOIN public.usuarios u ON u.id=actor AND u.activo
 LEFT JOIN public.miembros_ambito m ON m.usuario_id=u.id
 WHERE d.id=doc AND (u.rol_id=1 OR (d.situacion<>'ANULADO' AND ((u.rol_id IN (3,4) AND u.oficina_id IS NOT NULL) OR (u.rol_id=5 AND
 (d.ambito_id=m.ambito_id OR EXISTS(SELECT 1 FROM public.documentos_oficina o JOIN public.oficina_periodos p ON p.id=o.periodo_id
 JOIN public.oficina_periodos actual ON actual.usuario_id=u.id AND actual.oficina_id=p.oficina_id AND actual.fin IS NULL
 WHERE o.documento_id=d.id AND p.fin IS NOT NULL)))))))
$$;
CREATE FUNCTION proteger_documento_historico() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE doc bigint;
BEGIN
 IF TG_TABLE_NAME='documentos' THEN doc:=OLD.id;
 ELSIF TG_OP='DELETE' THEN doc:=OLD.documento_id; ELSE
  IF TG_OP='UPDATE' THEN
   IF public.documento_periodo_cerrado(OLD.documento_id) THEN RAISE EXCEPTION 'Documento histórico: solo lectura' USING ERRCODE='42501'; END IF;
  END IF;
  doc:=NEW.documento_id;
 END IF;
 IF EXISTS(SELECT 1 FROM public.usuarios WHERE id=nullif(current_setting('app.actor_id',true),'')::bigint AND rol_id IN(3,4) AND oficina_id IS NULL) THEN
  RAISE EXCEPTION 'Cuenta institucional sin asignación' USING ERRCODE='42501';
 END IF;
 IF public.documento_periodo_cerrado(doc) THEN
  IF TG_TABLE_NAME='documentos_pdf' AND TG_OP='DELETE' THEN
   IF public.es_finalizacion_retencion(OLD.documento_id,OLD.revision,OLD.clave_r2) THEN RETURN OLD; END IF;
  END IF;
  RAISE EXCEPTION 'Documento de un periodo anterior: solo lectura' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER a_proteger_historico BEFORE UPDATE ON documentos FOR EACH ROW EXECUTE FUNCTION proteger_documento_historico();
DO $$ DECLARE tabla text; BEGIN
 FOREACH tabla IN ARRAY ARRAY['valores_documento','ubicaciones_documento','delegaciones_documento','documentos_pdf','pdf_cargas'] LOOP
 EXECUTE format('CREATE TRIGGER a_proteger_historico BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.proteger_documento_historico()',tabla);
 END LOOP;
END $$;
CREATE TABLE tipos_oficina(tipo_id bigint PRIMARY KEY REFERENCES tipos_documentales(id) ON DELETE CASCADE,oficina_id bigint NOT NULL REFERENCES oficinas(id));
INSERT INTO tipos_oficina
 SELECT t.id,p.oficina_id FROM tipos_documentales t
 JOIN LATERAL (
  SELECT oficina_id FROM oficina_periodos p WHERE p.usuario_id=t.creado_por
   AND (p.fin IS NULL OR t.creado_en<p.fin)
  ORDER BY p.inicio,p.id LIMIT 1
 ) p ON true;
CREATE FUNCTION registrar_oficina_tipo() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.tipos_oficina SELECT NEW.id,u.oficina_id FROM public.usuarios u WHERE u.id=NEW.creado_por AND u.oficina_id IS NOT NULL;
 RETURN NULL;
END $$;
CREATE TRIGGER z_registrar_oficina_tipo AFTER INSERT ON tipos_documentales FOR EACH ROW EXECUTE FUNCTION registrar_oficina_tipo();
CREATE TABLE tipos_relevo(origen_id bigint NOT NULL REFERENCES tipos_documentales(id),destino_ambito_id bigint NOT NULL REFERENCES ambitos_registro(id),tipo_id bigint NOT NULL REFERENCES tipos_documentales(id),PRIMARY KEY(origen_id,destino_ambito_id));
CREATE FUNCTION validar_mapeo_tipo_relevo() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=nullif(current_setting('app.actor_id',true),'')::bigint AND activo AND rol_id IN(1,2)) THEN RAISE EXCEPTION 'Mapeo de tipos requiere administración' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tipos_documentales origen JOIN public.tipos_oficina o ON o.tipo_id=origen.id
 JOIN public.usuarios u ON u.oficina_id=o.oficina_id AND u.activo AND u.rol_id=5
 JOIN public.miembros_ambito m ON m.usuario_id=u.id AND m.ambito_id=NEW.destino_ambito_id
 JOIN public.tipos_documentales destino ON destino.id=NEW.tipo_id AND destino.ambito_id=m.ambito_id
 WHERE origen.id=NEW.origen_id AND origen.activo AND destino.activo AND origen.nombre=destino.nombre AND origen.prefijo=destino.prefijo)
 THEN RAISE EXCEPTION 'Mapeo de tipos incompatible con oficina o catálogo'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validar_mapeo_tipo_relevo BEFORE INSERT ON tipos_relevo FOR EACH ROW EXECUTE FUNCTION validar_mapeo_tipo_relevo();
REVOKE ALL ON oficina_periodos,documentos_oficina,tipos_oficina,tipos_relevo FROM PUBLIC;
REVOKE ALL ON FUNCTION sincronizar_periodo_oficina(),registrar_oficina_documento(),registrar_oficina_tipo() FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sistema_web_app') THEN
 GRANT SELECT ON oficina_periodos,documentos_oficina,tipos_oficina,tipos_relevo TO sistema_web_app;
 GRANT SELECT,INSERT ON tipos_relevo TO sistema_web_app;
END IF;END $$;
DO $migration$
DECLARE definicion text;
BEGIN
 SELECT pg_get_functiondef('public.validar_usuario_oficina()'::regprocedure) INTO definicion;
 definicion:=replace(definicion,'IF NEW.rol_id=3 THEN','IF NEW.rol_id=3 AND NEW.oficina_id IS NOT NULL THEN');
 definicion:=replace(definicion,'ELSIF NEW.rol_id=4 THEN','ELSIF NEW.rol_id=4 AND NEW.oficina_id IS NOT NULL THEN');
 EXECUTE definicion;
END $migration$;
CREATE FUNCTION exigir_oficina_autor() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.usuarios WHERE id=NEW.registrado_por AND rol_id IN(3,4) AND oficina_id IS NULL) THEN RAISE EXCEPTION 'Debe asignarse oficina antes de registrar'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_exigir_oficina_autor BEFORE INSERT ON documentos FOR EACH ROW EXECUTE FUNCTION exigir_oficina_autor();
COMMIT;
