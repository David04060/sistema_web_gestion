-- Producción: derivado de archivo-institucional/008-habilitar-continuidad-ordinaria-qa.sql
-- SHA256 del origen QA: f496bc01fba7910f3350c7301e33133bbea63da0e9aa7658011b077bc95325e2
-- Guarda propia de producción; el archivo QA original se conserva sin cambios.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtext('administracion-institucional'));
DO $destino$
BEGIN
 IF current_setting('application_name')<>'documental-migracion-20261026'
 OR current_database() IS DISTINCT FROM nullif(current_setting('app.actualizacion_base_esperada',true),'')
 OR (SELECT oid::text FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM current_setting('app.actualizacion_oid_esperado',true) THEN
 RAISE EXCEPTION 'Identidad de destino de actualización no confirmada'; END IF;
 IF current_setting('app.actualizacion_modo',true)='produccion' THEN
  IF current_database()<>'neondb' OR nullif(current_setting('neon.branch_id',true),'') IS NULL
   OR current_setting('neon.branch_id',true) IS DISTINCT FROM current_setting('app.actualizacion_rama_esperada',true) THEN
   RAISE EXCEPTION 'Rama de producción distinta de la autorizada'; END IF;
 ELSIF current_setting('app.actualizacion_modo',true)='ensayo-local' THEN
  IF current_database() !~ '^sistema_web_final_qa_archivo_[a-f0-9]{32}$'
   OR inet_server_addr() NOT IN ('127.0.0.1'::inet,'::1'::inet) OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL THEN
   RAISE EXCEPTION 'Restauración de ensayo no confirmada'; END IF;
 ELSE RAISE EXCEPTION 'Modo de actualización no autorizado'; END IF;
END;
$destino$;
-- Habilitación revisada de continuidad; no modifica participantes históricos.
ALTER TABLE archivos_relevos ADD COLUMN responsable_saliente_id bigint NOT NULL REFERENCES usuarios(id);
ALTER TABLE archivos_relevos ADD COLUMN responsable_entrante_id bigint NOT NULL REFERENCES usuarios(id);
ALTER TABLE movimientos_sustituciones ALTER COLUMN relevo_id DROP NOT NULL;
CREATE UNIQUE INDEX uq_relevo_original_entregado ON relevos_documentos(relevo_id,documento_id) WHERE hecho='ENTREGA';
CREATE FUNCTION public.fn_ai_direccion_autorizada() RETURNS boolean LANGUAGE sql STABLE AS $f$
 SELECT EXISTS(SELECT 1 FROM usuarios u JOIN roles r ON r.id=u.rol_id JOIN oficinas o ON o.id=u.oficina_id
 WHERE u.id::text=current_setting('app.usuario_actor_id',true) AND u.activo AND r.nombre='Director(a)' AND o.nombre='Dirección');
$f$;
-- Una sustitución solo se usa al ejecutar su intervención concreta, con hecho real
-- de esta transacción. Designar nunca basta para recibir, recuperar o cancelar.
CREATE FUNCTION public.fn_ai_sustitucion_actual(mov bigint,actor bigint,interv text) RETURNS boolean LANGUAGE sql STABLE AS $f$
 SELECT EXISTS(SELECT 1 FROM movimientos_sustituciones s JOIN sustituciones_actuaciones a ON a.sustitucion_id=s.id
 JOIN usuarios u ON u.id=s.sustituto_id JOIN movimientos_documentales m ON m.id=s.movimiento_id
 JOIN documentos d ON d.id=m.documento_id JOIN tipos_documentales td ON td.id=d.tipo_documental_id
 WHERE s.movimiento_id=mov AND s.sustituto_id=actor AND a.actuado_por_id=actor AND s.intervencion=interv
 AND s.id::text=current_setting('app.sustitucion_id',true) AND a.xmin::text=pg_current_xact_id()::text
 AND s.fecha_fin IS NULL AND u.activo AND u.oficina_id=s.oficina_intervencion_id
 AND NOT td.requiere_clave AND lower(btrim(td.nombre))<>'síseve'
 AND ((interv='DESTINO' AND s.oficina_intervencion_id=m.oficina_destino_id AND s.usuario_original_id=m.usuario_destino_id)
 OR (interv='ORIGEN' AND s.oficina_intervencion_id=m.oficina_origen_id AND s.usuario_original_id=m.usuario_origen_id)));
$f$;
CREATE FUNCTION public.fn_ai_entrega_actual(doc bigint,actor bigint) RETURNS boolean LANGUAGE sql STABLE AS $f$
 SELECT EXISTS(SELECT 1 FROM relevos_documentos rd JOIN archivos_relevos r ON r.id=rd.relevo_id
 JOIN archivos_asignaciones e ON e.id=r.asignacion_entrante_id JOIN documentos_archivos da ON da.documento_id=rd.documento_id
 JOIN documentos d ON d.id=rd.documento_id JOIN tipos_documentales td ON td.id=d.tipo_documental_id
 WHERE rd.documento_id=doc AND rd.hecho='ENTREGA' AND rd.recibido_por_id=actor
 AND rd.xmin::text=pg_current_xact_id()::text AND r.responsable_entrante_id=actor AND e.fecha_fin IS NULL
 AND r.fecha_aceptacion IS NOT NULL AND da.archivo_id=r.archivo_id
 AND d.responsable_actual_id=r.responsable_saliente_id AND d.activo
 AND NOT td.requiere_clave AND lower(btrim(td.nombre))<>'síseve'
 AND public.fn_mp_original_libre(doc));
$f$;
CREATE FUNCTION public.fn_ai_continuidad_operacion() RETURNS trigger LANGUAGE plpgsql AS $f$
DECLARE actor record; r record; d record; m record; s record; a record;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Historia inmutable' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('administracion-institucional'));
 SELECT * INTO actor FROM public.fn_documental_actor();
 IF TG_TABLE_NAME='archivos_relevos' THEN
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
  IF s.fecha_fin IS NOT NULL OR NEW.actuado_por_id<>actor.id OR s.sustituto_id<>actor.id
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
-- Retirada individual de barreras, nunca apertura indiscriminada de tablas.
DROP TRIGGER aa_ai_modelo_dormido ON archivos_relevos;
DROP TRIGGER aa_ai_modelo_dormido ON relevos_documentos;
DROP TRIGGER aa_ai_modelo_dormido ON movimientos_sustituciones;
DROP TRIGGER aa_ai_modelo_dormido ON sustituciones_actuaciones;
DROP TRIGGER ai_validar_relacion ON movimientos_sustituciones;
DROP TRIGGER ai_validar_relacion ON sustituciones_actuaciones;
CREATE TRIGGER aa_ai_continuidad BEFORE INSERT OR UPDATE OR DELETE ON archivos_relevos FOR EACH ROW EXECUTE FUNCTION fn_ai_continuidad_operacion();
CREATE TRIGGER aa_ai_continuidad BEFORE INSERT OR UPDATE OR DELETE ON relevos_documentos FOR EACH ROW EXECUTE FUNCTION fn_ai_continuidad_operacion();
CREATE TRIGGER aa_ai_continuidad BEFORE INSERT OR UPDATE OR DELETE ON movimientos_sustituciones FOR EACH ROW EXECUTE FUNCTION fn_ai_continuidad_operacion();
CREATE TRIGGER aa_ai_continuidad BEFORE INSERT OR UPDATE OR DELETE ON sustituciones_actuaciones FOR EACH ROW EXECUTE FUNCTION fn_ai_continuidad_operacion();
CREATE POLICY ai_relevo_lectura ON archivos_relevos FOR SELECT TO sistema_web_app USING
 (public.fn_ai_admin_autorizado() OR public.fn_ai_direccion_autorizada() OR current_setting('app.usuario_actor_id',true) IN(responsable_saliente_id::text,responsable_entrante_id::text));
CREATE POLICY ai_relevo_insert ON archivos_relevos FOR INSERT TO sistema_web_app WITH CHECK(public.fn_ai_admin_autorizado());
CREATE POLICY ai_relevo_aceptar ON archivos_relevos FOR UPDATE TO sistema_web_app USING(responsable_entrante_id::text=current_setting('app.usuario_actor_id',true)) WITH CHECK(responsable_entrante_id::text=current_setting('app.usuario_actor_id',true));
CREATE POLICY ai_asignacion_fin ON archivos_asignaciones FOR UPDATE TO sistema_web_app USING(public.fn_ai_admin_autorizado()) WITH CHECK(public.fn_ai_admin_autorizado());
CREATE POLICY ai_pertenencia_presentada ON documentos_archivos FOR SELECT TO sistema_web_app USING
 (EXISTS(SELECT 1 FROM archivos_relevos r JOIN documentos d ON d.id=documentos_archivos.documento_id JOIN tipos_documentales td ON td.id=d.tipo_documental_id
 WHERE r.archivo_id=documentos_archivos.archivo_id AND r.responsable_entrante_id::text=current_setting('app.usuario_actor_id',true)
 AND d.responsable_actual_id=r.responsable_saliente_id AND NOT td.requiere_clave AND lower(btrim(td.nombre))<>'síseve'));
CREATE POLICY ai_entregas_lectura ON relevos_documentos FOR SELECT TO sistema_web_app USING
 (NOT public.fn_ai_admin_autorizado() AND (public.fn_ai_documento_ordinario_visible(documento_id) OR recibido_por_id::text=current_setting('app.usuario_actor_id',true)));
CREATE POLICY ai_entregas_insert ON relevos_documentos FOR INSERT TO sistema_web_app WITH CHECK(recibido_por_id::text=current_setting('app.usuario_actor_id',true));
CREATE POLICY ai_sustituciones_lectura ON movimientos_sustituciones FOR SELECT TO sistema_web_app USING
 (public.fn_ai_direccion_autorizada() OR current_setting('app.usuario_actor_id',true) IN(usuario_original_id::text,sustituto_id::text));
CREATE POLICY ai_sustituciones_insert ON movimientos_sustituciones FOR INSERT TO sistema_web_app WITH CHECK(public.fn_ai_direccion_autorizada());
CREATE POLICY ai_sustituciones_fin ON movimientos_sustituciones FOR UPDATE TO sistema_web_app USING
 (public.fn_ai_direccion_autorizada() OR sustituto_id::text=current_setting('app.usuario_actor_id',true)) WITH CHECK(public.fn_ai_direccion_autorizada() OR sustituto_id::text=current_setting('app.usuario_actor_id',true));
CREATE POLICY ai_ejecucion_lectura ON sustituciones_actuaciones FOR SELECT TO sistema_web_app USING
 (EXISTS(SELECT 1 FROM movimientos_sustituciones s WHERE s.id=sustitucion_id));
CREATE POLICY ai_ejecucion_insert ON sustituciones_actuaciones FOR INSERT TO sistema_web_app WITH CHECK(actuado_por_id::text=current_setting('app.usuario_actor_id',true));
CREATE POLICY ai_continuidad_auditoria_insert ON auditoria_archivistica FOR INSERT TO sistema_web_app WITH CHECK
 (usuario_actor_id::text=current_setting('app.usuario_actor_id',true) AND tabla IN ('archivos_relevos','relevos_documentos','movimientos_sustituciones','sustituciones_actuaciones'));
CREATE POLICY ai_continuidad_auditoria_lectura ON auditoria_archivistica FOR SELECT TO sistema_web_app USING
 ((tabla='archivos_relevos' AND EXISTS(SELECT 1 FROM archivos_relevos r WHERE r.id=registro_id))
 OR (tabla='relevos_documentos' AND EXISTS(SELECT 1 FROM relevos_documentos r WHERE r.id=registro_id))
 OR (tabla='movimientos_sustituciones' AND EXISTS(SELECT 1 FROM movimientos_sustituciones r WHERE r.id=registro_id))
 OR (tabla='sustituciones_actuaciones' AND EXISTS(SELECT 1 FROM sustituciones_actuaciones r WHERE r.id=registro_id)));
GRANT SELECT ON archivos_relevos,relevos_documentos,movimientos_sustituciones,sustituciones_actuaciones TO sistema_web_app;
GRANT INSERT(archivo_id,asignacion_saliente_id,asignacion_entrante_id,formalizado_por_id,fecha_formalizacion,motivo,responsable_saliente_id,responsable_entrante_id) ON archivos_relevos TO sistema_web_app;
GRANT UPDATE(aceptado_por_id,fecha_aceptacion) ON archivos_relevos TO sistema_web_app;
GRANT UPDATE(fecha_fin,finalizado_por_id,motivo_fin) ON archivos_asignaciones TO sistema_web_app;
GRANT INSERT(relevo_id,documento_id,hecho,registrado_por_id,fecha_registro,motivo,recibido_por_id,fecha_entrega,archivador_confirmado_id) ON relevos_documentos TO sistema_web_app;
GRANT INSERT(relevo_id,movimiento_id,intervencion,usuario_original_id,sustituto_id,oficina_intervencion_id,autorizado_por_id,formalizado_por_id,fecha_autorizacion,motivo) ON movimientos_sustituciones TO sistema_web_app;
GRANT UPDATE(fecha_fin,finalizado_por_id,motivo_fin) ON movimientos_sustituciones TO sistema_web_app;
GRANT INSERT(sustitucion_id,actuado_por_id,operacion,fecha_actuacion,motivo) ON sustituciones_actuaciones TO sistema_web_app;
GRANT USAGE ON SEQUENCE archivos_relevos_id_seq,relevos_documentos_id_seq,movimientos_sustituciones_id_seq,sustituciones_actuaciones_id_seq TO sistema_web_app;
DO $adaptar$
DECLARE cuerpo text; nuevo text;
BEGIN
 SELECT pg_get_functiondef('public.fn_ai_administracion_inicial()'::regprocedure) INTO cuerpo;
 nuevo:=replace(cuerpo,'IF TG_OP<>''INSERT'' OR operacion IS DISTINCT FROM ''CREAR'' THEN',
 'IF NOT ((TG_OP=''INSERT'' AND operacion IN (''CREAR'',''RELEVAR'')) OR (TG_OP=''UPDATE'' AND operacion=''RELEVAR'')) THEN');
 nuevo:=replace(nuevo,'IF EXISTS (SELECT 1 FROM public.archivos_asignaciones WHERE archivo_id=NEW.archivo_id) THEN',
 'IF operacion=''CREAR'' AND EXISTS (SELECT 1 FROM public.archivos_asignaciones WHERE archivo_id=NEW.archivo_id) THEN');
 nuevo:=replace(nuevo,'ELSIF TG_TABLE_NAME=''archivos_asignaciones'' THEN',
 'ELSIF TG_TABLE_NAME=''archivos_asignaciones'' THEN
  IF TG_OP=''UPDATE'' AND operacion=''RELEVAR'' THEN
   IF NEW.motivo_fin IS DISTINCT FROM nullif(current_setting(''app.motivo_documental'',true),'''') THEN
    RAISE EXCEPTION ''Motivo de relevo requerido'' USING ERRCODE=''23514''; END IF;
   RETURN NEW;
  END IF;');
 IF nuevo=cuerpo THEN RAISE EXCEPTION 'Versión de barrera de asignaciones inesperada'; END IF;
 EXECUTE nuevo;
 SELECT pg_get_functiondef('public.fn_ai_auditoria_desde_trigger()'::regprocedure) INTO cuerpo;
 nuevo:=replace(cuerpo,'IF NEW.tabla IN (''archivos_institucionales'',''archivos_asignaciones'')',
 'IF NEW.tabla IN (''archivos_relevos'',''relevos_documentos'',''movimientos_sustituciones'',''sustituciones_actuaciones'') THEN RETURN NEW; END IF;
 IF NEW.tabla IN (''archivos_institucionales'',''archivos_asignaciones'')');
 IF nuevo=cuerpo THEN RAISE EXCEPTION 'Versión de auditoría inesperada'; END IF;
 EXECUTE nuevo;
END;
$adaptar$;

-- Conserva todas las reglas H03; solo añade los hechos de continuidad validados.
CREATE OR REPLACE FUNCTION public.fn_documentos_proteger_integridad()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE actor record; movimiento record; cambia_autorizacion boolean;
BEGIN
 SELECT * INTO actor FROM public.fn_documental_actor();
 IF TG_OP='UPDATE' AND public.fn_ai_entrega_actual(OLD.id,actor.id) THEN
  IF NEW.responsable_actual_id<>actor.id OR NEW.oficina_responsable_id<>actor.oficina_id
   OR NEW.oficina_responsable_id<>OLD.oficina_responsable_id OR
   (to_jsonb(NEW)-ARRAY['responsable_actual_id','archivador_id','fecha_modificacion']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['responsable_actual_id','archivador_id','fecha_modificacion']) OR NOT EXISTS
    (SELECT 1 FROM relevos_documentos rd WHERE rd.documento_id=OLD.id AND rd.recibido_por_id=actor.id
     AND rd.xmin::text=pg_current_xact_id()::text AND rd.archivador_confirmado_id IS NOT DISTINCT FROM NEW.archivador_id) THEN
   RAISE EXCEPTION 'Aceptación de relevo no coincide con el original presentado' USING ERRCODE='23514'; END IF;
  PERFORM public.fn_documental_validar_archivador(NEW.archivador_id,NEW.responsable_actual_id,NEW.oficina_responsable_id);
  RETURN NEW;
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.registrado_por_id<>actor.id OR NEW.responsable_actual_id<>actor.id
     OR actor.oficina_id IS NULL OR NEW.oficina_responsable_id IS DISTINCT FROM actor.oficina_id
     OR NOT NEW.activo OR NEW.destinatario_autorizado_id IS NOT NULL
     OR NEW.oficina_destino_autorizada_id IS NOT NULL OR NEW.decision_autorizada_por_id IS NOT NULL THEN
   RAISE EXCEPTION 'Registro inicial incompatible con el actor y su oficina' USING ERRCODE='23514';
  END IF;
  IF (actor.rol='Secretaria de Dirección' OR actor.oficina='Mesa de Partes') THEN
   IF NEW.estado_tramite<>'PENDIENTE_DECISION' THEN
    RAISE EXCEPTION 'Mesa de Partes registra PENDIENTE_DECISION' USING ERRCODE='23514';
   END IF;
  ELSIF NEW.estado_tramite<>'RECIBIDO' THEN
   RAISE EXCEPTION 'El registro ordinario confirma custodia inicial' USING ERRCODE='23514';
  END IF;
  PERFORM public.fn_documental_validar_archivador(NEW.archivador_id,NEW.responsable_actual_id,NEW.oficina_responsable_id);
  RETURN NEW;
 END IF;
 IF ROW(NEW.id,NEW.codigo,NEW.tipo_documental_id,NEW.registrado_por_id,NEW.fecha_creacion)
  IS DISTINCT FROM ROW(OLD.id,OLD.codigo,OLD.tipo_documental_id,OLD.registrado_por_id,OLD.fecha_creacion) THEN
  RAISE EXCEPTION 'Los identificadores y la autoria original son inmutables' USING ERRCODE='23514';
 END IF;
 IF NOT OLD.activo AND (to_jsonb(NEW)-'fecha_modificacion') IS DISTINCT FROM (to_jsonb(OLD)-'fecha_modificacion') THEN
  RAISE EXCEPTION 'No se puede modificar un documento anulado' USING ERRCODE='23514';
 END IF;
 IF NEW.estado_tramite IS DISTINCT FROM OLD.estado_tramite AND NOT (
  (OLD.estado_tramite='PENDIENTE_DECISION' AND NEW.estado_tramite IN ('EN_TRASLADO','CANCELADO'))
  OR (OLD.estado_tramite='RECIBIDO' AND NEW.estado_tramite IN ('PENDIENTE_DECISION','EN_TRASLADO','CANCELADO'))
  OR (OLD.estado_tramite='EN_TRASLADO' AND NEW.estado_tramite IN ('RECIBIDO','RECHAZADO'))
  OR (OLD.estado_tramite='RECHAZADO' AND NEW.estado_tramite='RECIBIDO')
 ) THEN
  RAISE EXCEPTION 'Transicion documental no permitida' USING ERRCODE='23514';
 END IF;
 cambia_autorizacion := ROW(NEW.destinatario_autorizado_id,NEW.oficina_destino_autorizada_id,NEW.decision_autorizada_por_id)
   IS DISTINCT FROM ROW(OLD.destinatario_autorizado_id,OLD.oficina_destino_autorizada_id,OLD.decision_autorizada_por_id);
 IF cambia_autorizacion AND NEW.estado_tramite='PENDIENTE_DECISION' THEN
  IF OLD.estado_tramite<>'PENDIENTE_DECISION' OR actor.rol IS DISTINCT FROM 'Director(a)' OR actor.oficina IS DISTINCT FROM 'Dirección'
     OR (to_jsonb(NEW)-ARRAY['fecha_modificacion','destinatario_autorizado_id','oficina_destino_autorizada_id','decision_autorizada_por_id'])
        IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['fecha_modificacion','destinatario_autorizado_id','oficina_destino_autorizada_id','decision_autorizada_por_id']) THEN
   RAISE EXCEPTION 'Solo Direccion modifica la autorizacion, conservando estado, contenido y custodia' USING ERRCODE='23514';
  END IF;
  IF NEW.destinatario_autorizado_id IS NOT NULL THEN
   IF NEW.decision_autorizada_por_id IS DISTINCT FROM actor.id
      OR NEW.oficina_destino_autorizada_id IS NULL
      OR NEW.destinatario_autorizado_id=OLD.responsable_actual_id THEN
    RAISE EXCEPTION 'Autorizacion incompleta o autor incompatible' USING ERRCODE='23514';
   END IF;
   PERFORM public.fn_documental_validar_destino(NEW.destinatario_autorizado_id,NEW.oficina_destino_autorizada_id);
  END IF;
  RETURN NEW; -- CHECK y auditoria se ejecutan; no se crea un movimiento.
 END IF;
 -- Los demas cambios pertenecen al custodio, salvo la recepcion real del destinatario.
 IF OLD.estado_tramite IN ('EN_TRASLADO','RECHAZADO') AND
    ROW(NEW.asunto,NEW.remitente,NEW.observaciones) IS DISTINCT FROM ROW(OLD.asunto,OLD.remitente,OLD.observaciones) THEN
  RAISE EXCEPTION 'No se corrige contenido durante circulacion o recuperacion pendiente' USING ERRCODE='23514';
 END IF;
 IF actor.id<>OLD.responsable_actual_id THEN
  IF NOT (OLD.estado_tramite='EN_TRASLADO' AND (
   (NEW.estado_tramite='RECIBIDO' AND EXISTS (
    SELECT 1 FROM public.movimientos_documentales m WHERE m.documento_id=OLD.id
     AND m.estado='RECIBIDO' AND m.recibido_por_id=actor.id
     AND (m.usuario_destino_id=NEW.responsable_actual_id OR (public.fn_ai_sustitucion_actual(m.id,actor.id,'DESTINO') AND NEW.responsable_actual_id=actor.id)) AND m.oficina_destino_id=NEW.oficina_responsable_id
     AND m.id=(SELECT max(id) FROM public.movimientos_documentales WHERE documento_id=OLD.id)))
   OR (NEW.estado_tramite='RECHAZADO' AND EXISTS (
    SELECT 1 FROM public.movimientos_documentales m WHERE m.documento_id=OLD.id
     AND m.estado='RECHAZADO' AND m.rechazado_por_id=actor.id AND (m.usuario_destino_id=actor.id OR public.fn_ai_sustitucion_actual(m.id,actor.id,'DESTINO'))
     AND m.id=(SELECT max(id) FROM public.movimientos_documentales WHERE documento_id=OLD.id)))
  ) OR (NEW.estado_tramite='RECIBIDO' AND OLD.estado_tramite IN ('EN_TRASLADO','RECHAZADO')
   AND NEW.responsable_actual_id=actor.id AND EXISTS(SELECT 1 FROM movimientos_documentales m WHERE m.documento_id=OLD.id
    AND m.id=(SELECT max(id) FROM movimientos_documentales WHERE documento_id=OLD.id)
    AND m.devolucion_confirmada_por_id=actor.id AND m.oficina_origen_id=NEW.oficina_responsable_id
    AND public.fn_ai_sustitucion_actual(m.id,actor.id,'ORIGEN')))) THEN
   RAISE EXCEPTION 'El actor no tiene permiso para modificar el documento' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.estado_tramite='EN_TRASLADO' AND OLD.estado_tramite<>'EN_TRASLADO' THEN
  SELECT * INTO movimiento FROM public.movimientos_documentales m
   WHERE m.documento_id=OLD.id AND m.estado='EN_TRASLADO' FOR UPDATE;
  IF NOT FOUND OR movimiento.usuario_origen_id<>OLD.responsable_actual_id
     OR movimiento.oficina_origen_id<>OLD.oficina_responsable_id
     OR NEW.responsable_actual_id<>OLD.responsable_actual_id
     OR NEW.oficina_responsable_id<>OLD.oficina_responsable_id THEN
   RAISE EXCEPTION 'La salida requiere el movimiento correspondiente y conserva custodia de entrega en origen' USING ERRCODE='23514';
  END IF;
  IF OLD.estado_tramite='PENDIENTE_DECISION' THEN
   IF OLD.destinatario_autorizado_id IS NULL OR OLD.oficina_destino_autorizada_id IS NULL
      OR OLD.decision_autorizada_por_id IS NULL
      OR movimiento.usuario_destino_id IS DISTINCT FROM OLD.destinatario_autorizado_id
      OR movimiento.oficina_destino_id IS DISTINCT FROM OLD.oficina_destino_autorizada_id
      OR movimiento.decidido_por_id IS DISTINCT FROM OLD.decision_autorizada_por_id THEN
    RAISE EXCEPTION 'La salida no coincide con la autorizacion de Direccion' USING ERRCODE='23514';
   END IF;
  END IF;
  IF NEW.archivador_id IS NOT NULL OR NEW.destinatario_autorizado_id IS NOT NULL
     OR NEW.oficina_destino_autorizada_id IS NOT NULL OR NEW.decision_autorizada_por_id IS NOT NULL THEN
   RAISE EXCEPTION 'La salida consume la autorizacion y retira el archivador confirmado' USING ERRCODE='23514';
  END IF;
 END IF;
 IF ROW(NEW.responsable_actual_id,NEW.oficina_responsable_id) IS DISTINCT FROM ROW(OLD.responsable_actual_id,OLD.oficina_responsable_id)
    AND NOT ((OLD.estado_tramite='EN_TRASLADO' AND NEW.estado_tramite='RECIBIDO') OR
 (OLD.estado_tramite='RECHAZADO' AND NEW.estado_tramite='RECIBIDO' AND EXISTS(SELECT 1 FROM movimientos_documentales m
 WHERE m.documento_id=OLD.id AND m.devolucion_confirmada_por_id=actor.id AND public.fn_ai_sustitucion_actual(m.id,actor.id,'ORIGEN')))) THEN
  RAISE EXCEPTION 'Solo la recepcion puede transferir custodia' USING ERRCODE='23514';
 END IF;
 IF NEW.archivador_id IS DISTINCT FROM OLD.archivador_id THEN
  IF NOT ((OLD.estado_tramite IN ('PENDIENTE_DECISION','RECIBIDO') AND NEW.estado_tramite='EN_TRASLADO')
       OR (OLD.estado_tramite IN ('EN_TRASLADO','RECHAZADO') AND NEW.estado_tramite='RECIBIDO')) THEN
   RAISE EXCEPTION 'El archivador solo cambia mediante salida, recepcion o recuperacion confirmada' USING ERRCODE='23514';
  END IF;
  IF NEW.estado_tramite NOT IN ('EN_TRASLADO','RECHAZADO') THEN
   PERFORM public.fn_documental_validar_archivador(NEW.archivador_id,NEW.responsable_actual_id,NEW.oficina_responsable_id);
  END IF;
 END IF;
 RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_movimientos_proteger_historial()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE actor record;
BEGIN
 SELECT * INTO actor FROM public.fn_documental_actor();
 IF ROW(NEW.id,NEW.documento_id,NEW.oficina_origen_id,NEW.usuario_origen_id,
        NEW.oficina_destino_id,NEW.usuario_destino_id,NEW.registrado_por_id,NEW.decidido_por_id,
        NEW.trasladado_por_id,NEW.fecha_salida,NEW.fecha_creacion)
   IS DISTINCT FROM
    ROW(OLD.id,OLD.documento_id,OLD.oficina_origen_id,OLD.usuario_origen_id,
        OLD.oficina_destino_id,OLD.usuario_destino_id,OLD.registrado_por_id,OLD.decidido_por_id,
        OLD.trasladado_por_id,OLD.fecha_salida,OLD.fecha_creacion) THEN
  RAISE EXCEPTION 'Origen, destino, autorizacion y salida historicos son inmutables' USING ERRCODE='23514';
 END IF;
 IF OLD.estado IN ('RECIBIDO','CANCELADO') OR (OLD.estado='RECHAZADO' AND OLD.devolucion_confirmada_por_id IS NOT NULL) THEN
  IF (to_jsonb(NEW)-'fecha_modificacion') IS DISTINCT FROM (to_jsonb(OLD)-'fecha_modificacion') THEN
   RAISE EXCEPTION 'Movimiento cerrado inmutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD.estado='RECHAZADO' THEN
  IF (actor.id<>OLD.usuario_origen_id AND NOT public.fn_ai_sustitucion_actual(OLD.id,actor.id,'ORIGEN')) OR NEW.estado<>'RECHAZADO'
     OR NEW.devolucion_confirmada_por_id IS DISTINCT FROM actor.id OR NEW.fecha_confirmacion_devolucion IS NULL
     OR (to_jsonb(NEW)-ARRAY['fecha_modificacion','devolucion_confirmada_por_id','fecha_confirmacion_devolucion'])
       IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['fecha_modificacion','devolucion_confirmada_por_id','fecha_confirmacion_devolucion']) THEN
   RAISE EXCEPTION 'Solo el remitente confirma una vez la recuperacion, conservando el rechazo' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD.estado<>'EN_TRASLADO' OR NEW.estado NOT IN ('RECIBIDO','RECHAZADO','CANCELADO') THEN
  RAISE EXCEPTION 'Transicion de movimiento no permitida' USING ERRCODE='23514';
 END IF;
 IF NEW.estado='RECIBIDO' AND ((actor.id<>OLD.usuario_destino_id AND NOT public.fn_ai_sustitucion_actual(OLD.id,actor.id,'DESTINO')) OR NEW.recibido_por_id IS DISTINCT FROM actor.id
     OR actor.oficina_id IS DISTINCT FROM OLD.oficina_destino_id) THEN
  RAISE EXCEPTION 'Solo el destinatario activo de la oficina de destino confirma recepcion' USING ERRCODE='23514';
 END IF;
 IF NEW.estado='RECHAZADO' AND ((actor.id<>OLD.usuario_destino_id AND NOT public.fn_ai_sustitucion_actual(OLD.id,actor.id,'DESTINO')) OR NEW.rechazado_por_id IS DISTINCT FROM actor.id) THEN
  RAISE EXCEPTION 'Solo el destinatario registra rechazo' USING ERRCODE='23514';
 END IF;
 IF NEW.estado='CANCELADO' AND ((actor.id<>OLD.usuario_origen_id AND NOT public.fn_ai_sustitucion_actual(OLD.id,actor.id,'ORIGEN')) OR NEW.cancelado_por_id IS DISTINCT FROM actor.id
     OR NEW.devolucion_confirmada_por_id IS DISTINCT FROM actor.id) THEN
  RAISE EXCEPTION 'Cancelar el traslado requiere recuperacion confirmada por el remitente' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_documental_validar_circulacion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE documento_id_actual bigint; documento public.documentos%ROWTYPE;
        movimiento public.movimientos_documentales%ROWTYPE; ultimo public.movimientos_documentales%ROWTYPE;
        custodio bigint; oficina bigint; entrega record;
BEGIN
 IF TG_TABLE_NAME='documentos' THEN documento_id_actual:=NEW.id;
 ELSE documento_id_actual:=NEW.documento_id; END IF;
 SELECT * INTO documento FROM public.documentos WHERE id=documento_id_actual FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento inexistente' USING ERRCODE='23514'; END IF;
 SELECT * INTO movimiento FROM public.movimientos_documentales
  WHERE documento_id=documento_id_actual AND (estado='EN_TRASLADO' OR (estado='RECHAZADO' AND devolucion_confirmada_por_id IS NULL));
 IF FOUND THEN
  IF documento.estado_tramite IS DISTINCT FROM movimiento.estado OR NOT documento.activo
     OR documento.responsable_actual_id IS DISTINCT FROM movimiento.usuario_origen_id
     OR documento.oficina_responsable_id IS DISTINCT FROM movimiento.oficina_origen_id
     OR documento.archivador_id IS NOT NULL THEN
   RAISE EXCEPTION 'Movimiento abierto y documento deben confirmarse juntos y conservar custodia de entrega' USING ERRCODE='23514';
  END IF;
 ELSE
  IF documento.estado_tramite IN ('EN_TRASLADO','RECHAZADO') THEN
   RAISE EXCEPTION 'El estado requiere un movimiento abierto correspondiente' USING ERRCODE='23514';
  END IF;
  SELECT * INTO ultimo FROM public.movimientos_documentales WHERE documento_id=documento_id_actual ORDER BY id DESC LIMIT 1;
  IF FOUND THEN
   IF ultimo.estado='RECIBIDO' THEN custodio:=ultimo.recibido_por_id; oficina:=ultimo.oficina_destino_id;
   ELSE custodio:=coalesce(ultimo.devolucion_confirmada_por_id,ultimo.usuario_origen_id); oficina:=ultimo.oficina_origen_id; END IF;
   SELECT rd.*,u.oficina_id INTO entrega FROM relevos_documentos rd JOIN usuarios u ON u.id=rd.recibido_por_id
    WHERE rd.documento_id=documento_id_actual AND rd.hecho='ENTREGA'
    AND rd.fecha_entrega>coalesce(ultimo.fecha_recepcion,ultimo.fecha_confirmacion_devolucion,ultimo.fecha_salida)
    ORDER BY rd.fecha_entrega DESC,rd.id DESC LIMIT 1;
   IF FOUND THEN custodio:=entrega.recibido_por_id;oficina:=entrega.oficina_id; END IF;
   IF documento.responsable_actual_id IS DISTINCT FROM custodio OR documento.oficina_responsable_id IS DISTINCT FROM oficina THEN
    RAISE EXCEPTION 'La custodia debe coincidir con la recepcion o recuperacion confirmada' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN NULL;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_documental_validar_archivador(archivador bigint, responsable bigint, oficina bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF archivador IS NULL THEN RETURN; END IF;
 PERFORM 1 FROM public.archivadores ar JOIN public.estantes e ON e.id=ar.estante_id
 WHERE ar.id=archivador AND e.oficina_id=oficina AND (e.usuario_id=responsable OR EXISTS
 (SELECT 1 FROM relevos_documentos rd JOIN archivos_relevos r ON r.id=rd.relevo_id
 JOIN archivos_asignaciones a ON a.id=r.asignacion_entrante_id
 WHERE rd.archivador_confirmado_id=ar.id AND rd.recibido_por_id=responsable AND rd.hecho='ENTREGA' AND a.fecha_fin IS NULL)) FOR SHARE OF ar,e;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'El archivador debe pertenecer al responsable y oficina de custodia' USING ERRCODE='23514';
 END IF;
END;
$function$
;
CREATE FUNCTION public.fn_ai_continuidad_final() RETURNS trigger LANGUAGE plpgsql AS $f$
DECLARE d record; m record; s record;
BEGIN
 IF TG_TABLE_NAME='relevos_documentos' THEN
  SELECT * INTO d FROM documentos WHERE id=NEW.documento_id;
  IF d.responsable_actual_id IS DISTINCT FROM NEW.recibido_por_id OR d.archivador_id IS DISTINCT FROM NEW.archivador_confirmado_id THEN
   RAISE EXCEPTION 'Entrega y custodia deben confirmarse juntas' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO s FROM movimientos_sustituciones WHERE id=NEW.sustitucion_id;
  SELECT * INTO m FROM movimientos_documentales WHERE id=s.movimiento_id;
  IF s.fecha_fin IS NULL OR (NEW.operacion='RECIBIR' AND (m.estado<>'RECIBIDO' OR m.recibido_por_id<>NEW.actuado_por_id))
   OR (NEW.operacion='RECHAZAR' AND (m.estado<>'RECHAZADO' OR m.rechazado_por_id<>NEW.actuado_por_id))
   OR (NEW.operacion='RECUPERAR' AND m.devolucion_confirmada_por_id IS DISTINCT FROM NEW.actuado_por_id)
   OR (NEW.operacion='CANCELAR' AND (m.estado<>'CANCELADO' OR m.cancelado_por_id<>NEW.actuado_por_id)) THEN
   RAISE EXCEPTION 'Intervención y hecho físico deben confirmarse juntos' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END;
$f$;
CREATE CONSTRAINT TRIGGER ct_ai_entrega_custodia AFTER INSERT ON relevos_documentos DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_ai_continuidad_final();
CREATE CONSTRAINT TRIGGER ct_ai_sustitucion_actuada AFTER INSERT ON sustituciones_actuaciones DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_ai_continuidad_final();
CREATE INDEX ix_relevo_custodia ON relevos_documentos(documento_id,fecha_entrega DESC) WHERE hecho='ENTREGA';
DO $permisos$
DECLARE nombre text;
BEGIN
 FOREACH nombre IN ARRAY ARRAY['fn_ai_direccion_autorizada()','fn_ai_sustitucion_actual(bigint,bigint,text)',
 'fn_ai_entrega_actual(bigint,bigint)','fn_ai_continuidad_operacion()','fn_ai_continuidad_final()'] LOOP
 EXECUTE 'REVOKE ALL ON FUNCTION public.'||nombre||' FROM PUBLIC';
 EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||nombre||' TO sistema_web_app';
 END LOOP;
END;
$permisos$;
-- La identidad del interviniente se verifica en fn_movimientos_proteger_historial
-- y en ct_ai_sustitucion_actuada. Los CHECK de forma y fechas se conservan;
-- las igualdades rígidas con el participante histórico se extienden al actor real.
DO $checks$
DECLARE cuerpo text; nuevo text;
BEGIN
 SELECT pg_get_constraintdef(oid) INTO cuerpo FROM pg_constraint WHERE conrelid='movimientos_documentales'::regclass AND conname='ck_movimientos_resultado';
 IF cuerpo IS NULL THEN RAISE EXCEPTION 'Falta protección de resultado de movimientos'; END IF;
 nuevo:=replace(cuerpo,' AND (recibido_por_id = usuario_destino_id)','');
 nuevo:=replace(nuevo,' AND (rechazado_por_id = usuario_destino_id)','');
 nuevo:=replace(nuevo,' AND (cancelado_por_id = usuario_origen_id)','');
 nuevo:=replace(nuevo,' AND (devolucion_confirmada_por_id = usuario_origen_id)','');
 IF nuevo=cuerpo THEN RAISE EXCEPTION 'Versión de CHECK de resultado inesperada'; END IF;
 ALTER TABLE movimientos_documentales DROP CONSTRAINT ck_movimientos_resultado;
 EXECUTE 'ALTER TABLE movimientos_documentales ADD CONSTRAINT ck_movimientos_resultado '||nuevo;
 ALTER TABLE movimientos_documentales DROP CONSTRAINT ck_movimientos_receptor;
 ALTER TABLE movimientos_documentales DROP CONSTRAINT ck_movimientos_rechaza;
 ALTER TABLE movimientos_documentales DROP CONSTRAINT ck_movimientos_confirma_dev;
END;
$checks$;
CREATE POLICY ai_direccion_archivo_lectura ON archivos_institucionales FOR SELECT TO sistema_web_app USING(public.fn_ai_direccion_autorizada());


COMMIT;
