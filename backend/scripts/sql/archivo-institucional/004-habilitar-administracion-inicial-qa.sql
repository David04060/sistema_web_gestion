-- Habilitacion LIMITADA: solo QA local con 001+002 aplicados.
-- No cambia los cuatro scripts anteriores ni las funciones documentales.
-- Antes de ejecutar, confirmar en la MISMA sesion:
-- app.migracion_base_esperada y app.migracion_oid_esperado.
-- El host/puerto se verifican tambien en el proceso que abre la conexion.
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
  RAISE EXCEPTION 'Habilitacion autorizada solo para la copia QA local confirmada';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sistema_documental_app'
   AND NOT rolsuper AND NOT rolbypassrls) THEN
  RAISE EXCEPTION 'Se requiere el rol restringido existente';
 END IF;
 IF to_regprocedure('public.fn_ai_validar_relacion()') IS NULL THEN
  RAISE EXCEPTION 'Falta 002';
 END IF;
END;
$guard$;

-- Politicas invoker: actor establecido por el servicio despues de validar JWT.
-- No autentica un JWT ni autoriza a quien posea credenciales SQL directamente.
CREATE FUNCTION public.fn_ai_admin_autorizado() RETURNS boolean
LANGUAGE sql STABLE AS $fn$
 SELECT EXISTS (SELECT 1 FROM public.usuarios u JOIN public.roles r ON r.id=u.rol_id
  WHERE u.id::text=nullif(current_setting('app.usuario_actor_id',true),'')
    AND u.activo AND r.nombre='Administrador');
$fn$;

CREATE FUNCTION public.fn_ai_administracion_inicial() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE actor record; operacion text:=current_setting('app.archivo_operacion',true);
BEGIN
 SELECT * INTO actor FROM public.fn_documental_actor();
 IF actor.rol<>'Administrador' THEN
  RAISE EXCEPTION 'Solo Administrador administra archivos' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='archivos_institucionales' THEN
  IF (TG_OP='INSERT' AND operacion IS DISTINCT FROM 'CREAR')
    OR (TG_OP='UPDATE' AND operacion IS DISTINCT FROM 'CORREGIR')
    OR TG_OP='DELETE' THEN
   RAISE EXCEPTION 'Operacion archivistica no habilitada' USING ERRCODE='55000';
  END IF;
  IF NEW.motivo IS DISTINCT FROM nullif(current_setting('app.motivo_documental',true),'') THEN
   RAISE EXCEPTION 'Motivo de la operacion requerido' USING ERRCODE='23514';
  END IF;
 ELSIF TG_TABLE_NAME='archivos_asignaciones' THEN
  IF TG_OP<>'INSERT' OR operacion IS DISTINCT FROM 'CREAR' THEN
   RAISE EXCEPTION 'Solo se habilita la asignacion inicial; historia inmutable' USING ERRCODE='55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.archivos_asignaciones WHERE archivo_id=NEW.archivo_id) THEN
   RAISE EXCEPTION 'El archivo ya tiene una asignacion inicial' USING ERRCODE='23514';
  END IF;
  IF NEW.motivo IS DISTINCT FROM nullif(current_setting('app.motivo_documental',true),'') THEN
   RAISE EXCEPTION 'Motivo de asignacion requerido' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$fn$;

-- Auditoria administrativa conserva antes/despues y motivos. Solo se instala
-- sobre archivo y asignacion; el resto conserva auditoria protegida/dormida.
CREATE FUNCTION public.fn_ai_auditar_administracion() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE actor record; cambios jsonb;
BEGIN
 SELECT * INTO actor FROM public.fn_documental_actor();
 IF TG_TABLE_NAME NOT IN ('archivos_institucionales','archivos_asignaciones') THEN
  RAISE EXCEPTION 'Tabla fuera de la auditoria administrativa';
 END IF;
 IF TG_OP='INSERT' THEN
  cambios:=jsonb_build_object('creacion',to_jsonb(NEW));
 ELSE
  SELECT coalesce(jsonb_object_agg(n.key,jsonb_build_object('antes',a.value,'despues',n.value)),'{}'::jsonb)
   INTO cambios FROM jsonb_each(to_jsonb(NEW)) n LEFT JOIN jsonb_each(to_jsonb(OLD)) a ON a.key=n.key
   WHERE n.value IS DISTINCT FROM a.value;
  -- Una correccion confirmada conserva siempre su motivo, aun si se repite.
  cambios:=cambios||jsonb_build_object('_motivo',NEW.motivo);
 END IF;
 INSERT INTO public.auditoria_archivistica(tabla,registro_id,accion,usuario_actor_id,campos_modificados)
 VALUES(TG_TABLE_NAME,NEW.id,CASE WHEN TG_OP='INSERT' THEN 'CREAR' ELSE 'MODIFICAR' END,actor.id,cambios);
 RETURN NULL;
END;
$fn$;

CREATE FUNCTION public.fn_ai_auditoria_desde_trigger() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
 IF TG_OP<>'INSERT' OR pg_trigger_depth()<2 OR NOT public.fn_ai_admin_autorizado()
 OR NEW.tabla NOT IN ('archivos_institucionales','archivos_asignaciones')
 OR NEW.usuario_actor_id::text IS DISTINCT FROM current_setting('app.usuario_actor_id',true) THEN
  RAISE EXCEPTION 'Auditoria solo desde la operacion administrativa' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END;
$fn$;

DROP TRIGGER aa_ai_modelo_dormido ON public.archivos_institucionales;
DROP TRIGGER aa_ai_modelo_dormido ON public.archivos_asignaciones;
DROP TRIGGER aa_ai_modelo_dormido ON public.auditoria_archivistica;
CREATE TRIGGER aa_ai_administracion_limitada BEFORE INSERT OR UPDATE OR DELETE ON public.archivos_institucionales
 FOR EACH ROW EXECUTE FUNCTION public.fn_ai_administracion_inicial();
CREATE TRIGGER aa_ai_administracion_limitada BEFORE INSERT OR UPDATE OR DELETE ON public.archivos_asignaciones
 FOR EACH ROW EXECUTE FUNCTION public.fn_ai_administracion_inicial();
CREATE TRIGGER aa_ai_auditoria_controlada BEFORE INSERT OR UPDATE OR DELETE ON public.auditoria_archivistica
 FOR EACH ROW EXECUTE FUNCTION public.fn_ai_auditoria_desde_trigger();
DROP TRIGGER ai_auditoria ON public.archivos_institucionales;
DROP TRIGGER ai_auditoria ON public.archivos_asignaciones;
CREATE TRIGGER ai_auditoria AFTER INSERT OR UPDATE ON public.archivos_institucionales
 FOR EACH ROW EXECUTE FUNCTION public.fn_ai_auditar_administracion();
CREATE TRIGGER ai_auditoria AFTER INSERT OR UPDATE ON public.archivos_asignaciones
 FOR EACH ROW EXECUTE FUNCTION public.fn_ai_auditar_administracion();

CREATE POLICY ai_admin_lectura ON public.archivos_institucionales FOR SELECT TO sistema_documental_app
 USING(public.fn_ai_admin_autorizado());
CREATE POLICY ai_admin_creacion ON public.archivos_institucionales FOR INSERT TO sistema_documental_app
 WITH CHECK(public.fn_ai_admin_autorizado() AND creado_por_id::text=current_setting('app.usuario_actor_id',true));
CREATE POLICY ai_admin_correccion ON public.archivos_institucionales FOR UPDATE TO sistema_documental_app
 USING(public.fn_ai_admin_autorizado()) WITH CHECK(public.fn_ai_admin_autorizado());
CREATE POLICY ai_asignacion_lectura ON public.archivos_asignaciones FOR SELECT TO sistema_documental_app
 USING(public.fn_ai_admin_autorizado());
CREATE POLICY ai_asignacion_inicial ON public.archivos_asignaciones FOR INSERT TO sistema_documental_app
 WITH CHECK(public.fn_ai_admin_autorizado() AND formalizado_por_id::text=current_setting('app.usuario_actor_id',true));
CREATE POLICY ai_auditoria_lectura ON public.auditoria_archivistica FOR SELECT TO sistema_documental_app
 USING(public.fn_ai_admin_autorizado() AND tabla IN ('archivos_institucionales','archivos_asignaciones'));
CREATE POLICY ai_auditoria_insercion ON public.auditoria_archivistica FOR INSERT TO sistema_documental_app
 WITH CHECK(public.fn_ai_admin_autorizado() AND usuario_actor_id::text=current_setting('app.usuario_actor_id',true)
  AND tabla IN ('archivos_institucionales','archivos_asignaciones'));

GRANT USAGE ON SCHEMA public TO sistema_documental_app;
GRANT SELECT ON public.usuarios,public.roles,public.oficinas TO sistema_documental_app;
-- PostgreSQL exige UPDATE en alguna columna para FOR SHARE. Solo se concede
-- id para los bloqueos existentes; ninguna ruta del modulo modifica catalogos.
GRANT UPDATE(id) ON public.usuarios,public.roles,public.oficinas TO sistema_documental_app;
GRANT SELECT ON public.archivos_institucionales,public.archivos_asignaciones,public.auditoria_archivistica TO sistema_documental_app;
GRANT INSERT(oficina_id,nombre,responsabilidad,creado_por_id,fecha_creacion,motivo)
 ON public.archivos_institucionales TO sistema_documental_app;
GRANT UPDATE(nombre,responsabilidad,motivo) ON public.archivos_institucionales TO sistema_documental_app;
GRANT INSERT(archivo_id,responsable_id,fecha_inicio,formalizado_por_id,motivo)
 ON public.archivos_asignaciones TO sistema_documental_app;
GRANT INSERT(tabla,registro_id,accion,usuario_actor_id,campos_modificados)
 ON public.auditoria_archivistica TO sistema_documental_app;
GRANT USAGE ON SEQUENCE public.archivos_institucionales_id_seq,
 public.archivos_asignaciones_id_seq,public.auditoria_archivistica_id_seq TO sistema_documental_app;
REVOKE ALL ON FUNCTION public.fn_ai_admin_autorizado(),public.fn_ai_administracion_inicial(),
 public.fn_ai_auditar_administracion(),public.fn_ai_auditoria_desde_trigger() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_ai_admin_autorizado(),public.fn_ai_administracion_inicial(),
 public.fn_ai_auditar_administracion(),public.fn_ai_auditoria_desde_trigger() TO sistema_documental_app;
-- Sin UPDATE/DELETE de historia, sin TRUNCATE, sin politicas ni permisos sobre
-- documentos_archivos, ingresos, relevos o sustituciones. RLS sigue FORCE.
COMMIT;
