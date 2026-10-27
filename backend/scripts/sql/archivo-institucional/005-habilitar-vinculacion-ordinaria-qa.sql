-- Aplicar después de 004, exclusivamente en QA local confirmado por nombre/OID.
-- No modifica documentos, movimientos, códigos ni sus triggers históricos.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(hashtext('administracion-institucional'));
DO $guard$
BEGIN
 IF current_database() !~ '^sistema_web_final_qa_archivo_[a-f0-9]{32}$'
 OR current_database() IS DISTINCT FROM nullif(current_setting('app.migracion_base_esperada',true),'')
 OR (SELECT oid::text FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM
    nullif(current_setting('app.migracion_oid_esperado',true),'')
 OR inet_server_addr() NOT IN ('127.0.0.1'::inet,'::1'::inet)
 OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL THEN
  RAISE EXCEPTION 'Destino QA local no confirmado';
 END IF;
 IF to_regprocedure('public.fn_ai_admin_autorizado()') IS NULL OR NOT EXISTS
  (SELECT 1 FROM pg_roles WHERE rolname='sistema_documental_app' AND NOT rolsuper AND NOT rolbypassrls) THEN
  RAISE EXCEPTION 'Requiere 004 y rol restringido';
 END IF;
END;
$guard$;

-- Hecho histórico explícito para registros nuevos. En documentos antiguos puede
-- quedar NULL si no existe evidencia de creación; no se infiere de la cuenta.
ALTER TABLE public.documentos_archivos ADD COLUMN oficina_registro_id bigint
 REFERENCES public.oficinas(id) ON DELETE RESTRICT;

-- Funciones INVOKER: RLS limita las relaciones nuevas; JWT y permisos funcionales
-- se validan en servicios. El contexto SQL no autentica a un usuario por sí solo.
CREATE FUNCTION public.fn_ai_documento_ordinario_visible(doc bigint) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
 SELECT EXISTS (SELECT 1 FROM public.documentos d
 JOIN public.tipos_documentales td ON td.id=d.tipo_documental_id
 JOIN public.usuarios u ON u.id::text=nullif(current_setting('app.usuario_actor_id',true),'')
 JOIN public.roles r ON r.id=u.rol_id
 WHERE d.id=doc AND u.activo AND NOT td.requiere_clave AND lower(btrim(td.nombre))<>'síseve'
 AND (d.registrado_por_id=u.id OR d.responsable_actual_id=u.id OR r.nombre='Director(a)'));
$fn$;

CREATE FUNCTION public.fn_ai_pertenencia_ordinaria() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE actor record; doc record; modo text:=current_setting('app.pertenencia_operacion',true);
BEGIN
 IF TG_OP<>'INSERT' OR modo IS NULL OR modo NOT IN ('REGISTRAR','VINCULAR') THEN
  RAISE EXCEPTION 'Solo se permite la vinculación inicial ordinaria' USING ERRCODE='55000';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext('administracion-institucional'));
 SELECT * INTO actor FROM public.fn_documental_actor();
 SELECT d.*,td.requiere_clave,td.nombre tipo INTO doc FROM public.documentos d
 JOIN public.tipos_documentales td ON td.id=d.tipo_documental_id WHERE d.id=NEW.documento_id FOR UPDATE OF d;
 IF NOT FOUND OR doc.requiere_clave OR lower(btrim(doc.tipo))='síseve'
 OR actor.rol NOT IN ('Usuario','Director(a)','Secretaria de Dirección')
 OR NEW.vinculado_por_id IS DISTINCT FROM actor.id OR doc.registrado_por_id<>actor.id
 OR doc.responsable_actual_id<>actor.id OR NOT doc.activo
 OR doc.estado_tramite NOT IN ('RECIBIDO','PENDIENTE_DECISION')
 OR doc.destinatario_autorizado_id IS NOT NULL THEN
  RAISE EXCEPTION 'Documento no habilitado para vinculación ordinaria' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.archivos_asignaciones s
 JOIN public.archivos_institucionales a ON a.id=s.archivo_id
 JOIN public.usuarios u ON u.id=s.responsable_id
 WHERE s.archivo_id=NEW.archivo_id AND s.responsable_id=actor.id AND s.fecha_fin IS NULL
 AND s.fecha_inicio<=clock_timestamp() AND u.activo AND u.oficina_id=a.oficina_id) THEN
  RAISE EXCEPTION 'Asignación vigente propia requerida' USING ERRCODE='23514';
 END IF;
 IF EXISTS (SELECT 1 FROM public.movimientos_documentales WHERE documento_id=NEW.documento_id
 AND (estado='EN_TRASLADO' OR (estado='RECHAZADO' AND devolucion_confirmada_por_id IS NULL))) THEN
  RAISE EXCEPTION 'Circulación o recuperación pendiente' USING ERRCODE='23514';
 END IF;
 IF modo='REGISTRAR' AND NEW.oficina_registro_id IS DISTINCT FROM actor.oficina_id THEN
  RAISE EXCEPTION 'Oficina inicial requerida' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;

-- Conserva la auditoría administrativa de 004 y añade solo la relación ordinaria.
CREATE OR REPLACE FUNCTION public.fn_ai_auditoria_desde_trigger() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
 IF TG_OP<>'INSERT' OR pg_trigger_depth()<2
 OR NEW.usuario_actor_id::text IS DISTINCT FROM current_setting('app.usuario_actor_id',true) THEN
  RAISE EXCEPTION 'Auditoría solo desde una operación autorizada' USING ERRCODE='55000';
 END IF;
 IF NEW.tabla IN ('archivos_institucionales','archivos_asignaciones') AND public.fn_ai_admin_autorizado() THEN
  RETURN NEW;
 ELSIF NEW.tabla='documentos_archivos' AND NEW.accion='CREAR' AND EXISTS
  (SELECT 1 FROM public.documentos_archivos da WHERE da.id=NEW.registro_id
   AND da.vinculado_por_id=NEW.usuario_actor_id AND public.fn_ai_documento_ordinario_visible(da.documento_id)) THEN
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'Auditoría fuera del alcance habilitado' USING ERRCODE='55000';
END;
$fn$;

DROP TRIGGER aa_ai_modelo_dormido ON public.documentos_archivos;
CREATE TRIGGER aa_ai_vinculacion_ordinaria BEFORE INSERT OR UPDATE OR DELETE ON public.documentos_archivos
 FOR EACH ROW EXECUTE FUNCTION public.fn_ai_pertenencia_ordinaria();
-- ai_validar_relacion, ai_no_borrado, ai_no_truncate y ai_auditoria se conservan.
CREATE POLICY ai_pertenencia_lectura ON public.documentos_archivos FOR SELECT TO sistema_documental_app
 USING(public.fn_ai_documento_ordinario_visible(documento_id));
CREATE POLICY ai_pertenencia_insercion ON public.documentos_archivos FOR INSERT TO sistema_documental_app
 WITH CHECK(vinculado_por_id::text=current_setting('app.usuario_actor_id',true)
  AND public.fn_ai_documento_ordinario_visible(documento_id));

-- Dependencias sin ciclos RLS: asignaciones -> pertenencias -> documentos;
-- archivos -> asignaciones/pertenencias. No políticas de escritura nuevas aquí.
CREATE POLICY ai_asignacion_operativa_lectura ON public.archivos_asignaciones FOR SELECT TO sistema_documental_app
 USING((responsable_id::text=current_setting('app.usuario_actor_id',true) AND fecha_fin IS NULL)
 OR EXISTS (SELECT 1 FROM public.documentos_archivos da WHERE da.archivo_id=archivos_asignaciones.archivo_id));
CREATE POLICY ai_archivo_operativo_lectura ON public.archivos_institucionales FOR SELECT TO sistema_documental_app
 USING(EXISTS (SELECT 1 FROM public.archivos_asignaciones s WHERE s.archivo_id=archivos_institucionales.id
 AND s.responsable_id::text=current_setting('app.usuario_actor_id',true) AND s.fecha_fin IS NULL)
 OR EXISTS (SELECT 1 FROM public.documentos_archivos da WHERE da.archivo_id=archivos_institucionales.id));
CREATE POLICY ai_pertenencia_auditoria_insercion ON public.auditoria_archivistica FOR INSERT TO sistema_documental_app
 WITH CHECK(tabla='documentos_archivos' AND usuario_actor_id::text=current_setting('app.usuario_actor_id',true)
 AND EXISTS(SELECT 1 FROM public.documentos_archivos da WHERE da.id=registro_id));
CREATE POLICY ai_pertenencia_auditoria_lectura ON public.auditoria_archivistica FOR SELECT TO sistema_documental_app
 USING(tabla='documentos_archivos' AND EXISTS(SELECT 1 FROM public.documentos_archivos da WHERE da.id=registro_id));

GRANT SELECT ON public.documentos_archivos TO sistema_documental_app;
-- Dependencias INVOKER de las políticas de consulta. No equivale a conceder
-- consulta global HTTP: documentos conserva la autorización del servicio.
GRANT SELECT ON public.documentos,public.tipos_documentales TO sistema_documental_app;
GRANT INSERT(documento_id,archivo_id,vinculado_por_id,fecha_vinculacion,fundamento,oficina_registro_id)
 ON public.documentos_archivos TO sistema_documental_app;
GRANT USAGE ON SEQUENCE public.documentos_archivos_id_seq TO sistema_documental_app;
-- La validación de asignación comparte el cerrojo institucional de sus triggers.
-- No se necesita ni se concede UPDATE sobre historia de asignaciones.
REVOKE ALL ON FUNCTION public.fn_ai_documento_ordinario_visible(bigint),public.fn_ai_pertenencia_ordinaria() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_ai_documento_ordinario_visible(bigint),public.fn_ai_pertenencia_ordinaria()
 TO sistema_documental_app;
-- El runtime necesita además los privilegios de su circuito documental anterior.
-- No se conceden aquí: el arnés QA los verifica/prepara separadamente.
-- Sin UPDATE/DELETE de pertenencias, sin nuevas políticas de ingresos o relevos.
COMMIT;
