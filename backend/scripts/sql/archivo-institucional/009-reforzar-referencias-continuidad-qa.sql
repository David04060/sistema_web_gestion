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
 IF to_regprocedure('public.fn_ai_pertenencia_ordinaria()') IS NULL OR NOT EXISTS
  (SELECT 1 FROM pg_roles WHERE rolname='sistema_documental_app' AND NOT rolsuper AND NOT rolbypassrls) THEN
  RAISE EXCEPTION 'Requiere 005 y rol restringido';
 END IF;
END;
$guard$;

-- Refuerzo de referencias y errores de integridad de continuidad. No modifica datos.
CREATE OR REPLACE FUNCTION public.fn_ai_continuidad_operacion() RETURNS trigger LANGUAGE plpgsql AS $f$
DECLARE actor record; r record; d record; m record; s record; a record;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Historia inmutable' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('administracion-institucional'));
 SELECT * INTO actor FROM public.fn_documental_actor();
 IF TG_TABLE_NAME='archivos_relevos' THEN
  IF NEW.archivo_id IS NULL OR NEW.asignacion_saliente_id IS NULL OR NEW.asignacion_entrante_id IS NULL
   OR NEW.responsable_saliente_id IS NULL OR NEW.responsable_entrante_id IS NULL THEN
   RAISE EXCEPTION 'Referencias completas de relevo requeridas' USING ERRCODE='23514'; END IF;
  SELECT sal.responsable_id saliente,e.responsable_id entrante,e.fecha_fin INTO r
   FROM archivos_asignaciones sal JOIN archivos_asignaciones e ON e.id=NEW.asignacion_entrante_id
   WHERE sal.id=NEW.asignacion_saliente_id;
  IF NEW.responsable_saliente_id IS DISTINCT FROM r.saliente OR NEW.responsable_entrante_id IS DISTINCT FROM r.entrante
   OR r.fecha_fin IS NOT NULL THEN RAISE EXCEPTION 'Referencias de relevo incompatibles' USING ERRCODE='23514'; END IF;
  RETURN NEW; -- ai_validar_relacion conserva continuidad de períodos y aceptación personal.
 END IF;
 IF TG_TABLE_NAME='relevos_documentos' THEN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Entrega de relevo inmutable' USING ERRCODE='23514'; END IF;
  SELECT * INTO r FROM archivos_relevos WHERE id=NEW.relevo_id;
  SELECT dd.*,td.requiere_clave,td.nombre tipo INTO d FROM documentos dd JOIN tipos_documentales td ON td.id=dd.tipo_documental_id WHERE dd.id=NEW.documento_id FOR UPDATE OF dd;
  IF NOT FOUND OR d.requiere_clave OR lower(btrim(d.tipo))='síseve' OR actor.rol='Administrador'
   OR actor.id<>r.responsable_entrante_id OR NEW.hecho<>'ENTREGA' OR NEW.registrado_por_id<>actor.id
   OR NEW.recibido_por_id<>actor.id OR d.responsable_actual_id<>r.responsable_saliente_id
   OR d.oficina_responsable_id<>actor.oficina_id OR NOT public.fn_mp_original_libre(d.id)
   OR NOT EXISTS(SELECT 1 FROM archivos_asignaciones e WHERE e.id=r.asignacion_entrante_id AND e.fecha_fin IS NULL) THEN
   RAISE EXCEPTION 'Original no habilitado para recepción de relevo' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='sustituciones_actuaciones' THEN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Actuación de sustitución inmutable' USING ERRCODE='23514'; END IF;
  SELECT * INTO s FROM movimientos_sustituciones WHERE id=NEW.sustitucion_id;
  SELECT * INTO m FROM movimientos_documentales WHERE id=s.movimiento_id;
  IF s.id IS NULL OR NEW.actuado_por_id IS NULL OR NEW.operacion IS NULL OR s.fecha_fin IS NOT NULL OR NEW.actuado_por_id<>actor.id OR s.sustituto_id<>actor.id
   OR actor.oficina_id<>s.oficina_intervencion_id OR NEW.fecha_actuacion<s.fecha_autorizacion
   OR NEW.sustitucion_id::text IS DISTINCT FROM current_setting('app.sustitucion_id',true)
   OR (s.intervencion='DESTINO' AND (m.estado<>'EN_TRASLADO' OR NEW.operacion NOT IN ('RECIBIR','RECHAZAR')))
   OR (s.intervencion='ORIGEN' AND NOT ((NEW.operacion='CANCELAR' AND m.estado='EN_TRASLADO')
      OR (NEW.operacion='RECUPERAR' AND m.estado='RECHAZADO' AND m.devolucion_confirmada_por_id IS NULL))) THEN
   RAISE EXCEPTION 'Intervención de sustitución no vigente' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 SELECT mm.*,dd.tipo_documental_id,td.requiere_clave,td.nombre tipo INTO m FROM movimientos_documentales mm
 JOIN documentos dd ON dd.id=mm.documento_id JOIN tipos_documentales td ON td.id=dd.tipo_documental_id
 WHERE mm.id=NEW.movimiento_id;
 IF NOT FOUND OR m.requiere_clave OR lower(btrim(m.tipo))='síseve' THEN RAISE EXCEPTION 'Movimiento ordinario requerido' USING ERRCODE='23514'; END IF;
 PERFORM id FROM documentos WHERE id=m.documento_id FOR UPDATE;
 PERFORM id FROM movimientos_documentales WHERE id=m.id FOR UPDATE;
 IF TG_OP='INSERT' THEN
  IF NEW.relevo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM archivos_relevos rr JOIN documentos_archivos da ON da.archivo_id=rr.archivo_id
   WHERE rr.id=NEW.relevo_id AND da.documento_id=m.documento_id AND rr.responsable_saliente_id=NEW.usuario_original_id
   AND rr.responsable_entrante_id=NEW.sustituto_id) THEN
   RAISE EXCEPTION 'La designación no corresponde al relevo indicado' USING ERRCODE='23514'; END IF;
  IF NOT public.fn_ai_direccion_autorizada() OR NEW.autorizado_por_id<>actor.id OR NEW.formalizado_por_id<>actor.id
   OR NEW.fecha_fin IS NOT NULL OR NEW.fecha_autorizacion>clock_timestamp()
   OR NEW.usuario_original_id IS DISTINCT FROM (CASE WHEN NEW.intervencion='DESTINO' THEN m.usuario_destino_id ELSE m.usuario_origen_id END)
   OR NEW.oficina_intervencion_id IS DISTINCT FROM (CASE WHEN NEW.intervencion='DESTINO' THEN m.oficina_destino_id ELSE m.oficina_origen_id END)
   OR (NEW.intervencion='DESTINO' AND m.estado<>'EN_TRASLADO')
   OR (NEW.intervencion='ORIGEN' AND NOT (m.estado='EN_TRASLADO' OR (m.estado='RECHAZADO' AND m.devolucion_confirmada_por_id IS NULL)))
   OR NOT EXISTS(SELECT 1 FROM usuarios u JOIN roles ro ON ro.id=u.rol_id WHERE u.id=NEW.sustituto_id AND u.activo
    AND ro.nombre<>'Administrador' AND u.oficina_id=NEW.oficina_intervencion_id) THEN
   RAISE EXCEPTION 'Designación exige autorización institucional expresa e intervención pendiente de la misma oficina' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.fecha_fin IS NOT NULL OR NEW.fecha_fin IS NULL OR NEW.finalizado_por_id<>actor.id OR
   (to_jsonb(NEW)-ARRAY['fecha_fin','finalizado_por_id','motivo_fin']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['fecha_fin','finalizado_por_id','motivo_fin'])
   OR NOT (public.fn_ai_direccion_autorizada() OR EXISTS(SELECT 1 FROM sustituciones_actuaciones sa
      WHERE sa.sustitucion_id=NEW.id AND sa.actuado_por_id=actor.id AND sa.xmin::text=pg_current_xact_id()::text)) THEN
   RAISE EXCEPTION 'Designación inmutable salvo finalización autorizada' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END;
$f$;
COMMIT;
