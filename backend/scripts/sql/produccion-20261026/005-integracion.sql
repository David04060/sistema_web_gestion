-- Producción: derivado de archivo-institucional/006-habilitar-primer-ingreso-ordinario-qa.sql
-- SHA256 del origen QA: 6f9f47c305eb962311067b99fd65d9eaf32a5b77f15db36a312b8e1df30a1595
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
-- Ninguna fecha se inventa para historia anterior. Cada nueva operación la proporciona.
ALTER TABLE public.ingresos_mesa_partes ADD COLUMN fecha_presentacion timestamptz;
-- Clave del envío externo; no deriva del asunto ni identifica otro original.
ALTER TABLE public.ingresos_mesa_partes ADD COLUMN solicitud_id uuid;
CREATE UNIQUE INDEX uq_mp_solicitud ON public.ingresos_mesa_partes(solicitud_id) WHERE solicitud_id IS NOT NULL;
ALTER TABLE public.ingresos_mesa_partes ADD CONSTRAINT ck_mp_fecha_presentacion
 CHECK(fecha_presentacion IS NULL OR (isfinite(fecha_presentacion) AND fecha_presentacion<=fecha_ingreso));

CREATE FUNCTION public.fn_mp_mesa_autorizada() RETURNS boolean LANGUAGE sql STABLE AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.usuarios u JOIN public.roles r ON r.id=u.rol_id
 JOIN public.oficinas o ON o.id=u.oficina_id WHERE u.id::text=current_setting('app.usuario_actor_id',true)
 AND u.activo AND r.nombre='Secretaria de Dirección' AND o.nombre='Mesa de Partes');
$fn$;
CREATE FUNCTION public.fn_mp_destinataria_pendiente(doc bigint) RETURNS boolean LANGUAGE sql STABLE AS $fn$
 SELECT public.fn_mp_mesa_autorizada() AND EXISTS(SELECT 1 FROM public.movimientos_documentales m
 JOIN public.documentos d ON d.id=m.documento_id JOIN public.tipos_documentales td ON td.id=d.tipo_documental_id
 JOIN public.usuarios u ON u.id=m.usuario_destino_id
 WHERE d.id=doc AND d.activo AND NOT td.requiere_clave AND lower(btrim(td.nombre))<>'síseve'
 AND m.usuario_destino_id::text=current_setting('app.usuario_actor_id',true)
 AND m.oficina_destino_id=u.oficina_id AND m.estado='EN_TRASLADO'
 AND m.id=(SELECT id FROM public.movimientos_documentales WHERE documento_id=doc ORDER BY id DESC LIMIT 1));
$fn$;
CREATE FUNCTION public.fn_mp_recorrido_visible(doc bigint) RETURNS boolean LANGUAGE sql STABLE AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.documentos d JOIN public.tipos_documentales td ON td.id=d.tipo_documental_id
 JOIN public.usuarios u ON u.id::text=current_setting('app.usuario_actor_id',true) JOIN public.roles r ON r.id=u.rol_id
 WHERE d.id=doc AND u.activo AND r.nombre<>'Administrador'
 AND NOT td.requiere_clave AND lower(btrim(td.nombre))<>'síseve'
 AND (d.registrado_por_id=u.id OR d.responsable_actual_id=u.id OR r.nombre='Director(a)'
 OR EXISTS(SELECT 1 FROM public.movimientos_documentales m WHERE m.documento_id=d.id
 AND u.id IN(m.usuario_origen_id,m.usuario_destino_id,m.registrado_por_id,m.decidido_por_id,m.trasladado_por_id))));
$fn$;

CREATE FUNCTION public.fn_mp_validar_primera_presentacion() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE actor record; doc record; recepcion record; salida record; ingreso record;
 modo text:=current_setting('app.primer_ingreso_operacion',true);
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Hechos de primer ingreso inmutables en esta etapa' USING ERRCODE='55000'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('administracion-institucional'));
 SELECT * INTO actor FROM public.fn_documental_actor();
 SELECT d.*,d.xmin transaccion,td.requiere_clave,td.nombre tipo INTO doc FROM public.documentos d
 JOIN public.tipos_documentales td ON td.id=d.tipo_documental_id WHERE d.id=NEW.documento_id FOR UPDATE OF d;
 IF NOT FOUND OR doc.requiere_clave OR lower(btrim(doc.tipo))='síseve' OR NOT doc.activo THEN
  RAISE EXCEPTION 'Documento no habilitado para ingreso ordinario' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='ingresos_mesa_partes' THEN
  IF NOT public.fn_mp_mesa_autorizada() OR modo IS NULL OR modo NOT IN ('RECIBIR','FORMALIZAR','EXTERNO')
  OR NEW.registrado_por_id<>actor.id OR doc.responsable_actual_id<>actor.id OR doc.oficina_responsable_id<>actor.oficina_id
  OR doc.estado_tramite NOT IN ('RECIBIDO','PENDIENTE_DECISION') OR doc.destinatario_autorizado_id IS NOT NULL
  OR NEW.ingreso_anterior_id IS NOT NULL OR NEW.fecha_presentacion IS NULL
  OR NEW.fecha_conclusion IS NOT NULL OR NEW.concluido_por_id IS NOT NULL OR NEW.motivo_conclusion IS NOT NULL OR NEW.resultado IS NOT NULL
  OR NEW.fecha_invalidacion IS NOT NULL OR NEW.invalidado_por_id IS NOT NULL OR NEW.motivo_invalidacion IS NOT NULL THEN
   RAISE EXCEPTION 'Solo primera presentación por Secretaría bajo custodia confirmada' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.ingresos_mesa_partes WHERE documento_id=NEW.documento_id) THEN
   RAISE EXCEPTION 'El documento ya tiene un primer ingreso' USING ERRCODE='23505';
  END IF;
  IF EXISTS(SELECT 1 FROM public.movimientos_documentales WHERE documento_id=NEW.documento_id
    AND (estado='EN_TRASLADO' OR (estado='RECHAZADO' AND devolucion_confirmada_por_id IS NULL))) THEN
   RAISE EXCEPTION 'Circulación incompatible con primer ingreso' USING ERRCODE='23514';
  END IF;
  IF NEW.movimiento_recepcion_id IS NULL THEN
   IF modo<>'EXTERNO' OR NEW.solicitud_id IS NULL OR doc.transaccion IS DISTINCT FROM pg_current_xact_id()::xid
    OR doc.registrado_por_id<>actor.id OR NOT EXISTS(SELECT 1 FROM public.documentos_archivos WHERE documento_id=doc.id)
    OR EXISTS(SELECT 1 FROM public.movimientos_documentales WHERE documento_id=doc.id) THEN
    RAISE EXCEPTION 'Original externo exige alta conjunta sin movimiento ficticio' USING ERRCODE='23514';
   END IF;
  ELSE
   SELECT * INTO recepcion FROM public.movimientos_documentales WHERE id=NEW.movimiento_recepcion_id;
   IF modo NOT IN ('RECIBIR','FORMALIZAR') OR NEW.solicitud_id IS NOT NULL OR NOT FOUND OR recepcion.documento_id<>doc.id OR recepcion.estado<>'RECIBIDO'
   OR recepcion.usuario_destino_id<>actor.id OR recepcion.oficina_destino_id<>actor.oficina_id
   OR recepcion.recibido_por_id IS DISTINCT FROM actor.id OR recepcion.fecha_recepcion IS NULL
   OR recepcion.fecha_recepcion>NEW.fecha_ingreso
   OR recepcion.id<>(SELECT id FROM public.movimientos_documentales WHERE documento_id=doc.id ORDER BY id DESC LIMIT 1) THEN
    RAISE EXCEPTION 'Evidencia de recepción vigente incompatible' USING ERRCODE='23514';
   END IF;
  END IF;
 ELSE
  SELECT m.*,m.xmin transaccion INTO salida FROM public.movimientos_documentales m WHERE id=NEW.movimiento_id;
  SELECT * INTO ingreso FROM public.ingresos_mesa_partes WHERE id=NEW.ingreso_id;
  IF modo IS DISTINCT FROM 'SALIDA' OR NOT FOUND OR salida.transaccion IS DISTINCT FROM pg_current_xact_id()::xid
   OR salida.documento_id<>doc.id OR ingreso.documento_id<>doc.id OR salida.estado<>'EN_TRASLADO'
   OR ingreso.fecha_conclusion IS NOT NULL OR ingreso.fecha_invalidacion IS NOT NULL
   OR salida.fecha_salida<ingreso.fecha_ingreso
   OR salida.usuario_origen_id<>actor.id OR NEW.vinculado_por_id<>actor.id OR actor.rol='Administrador' THEN
   RAISE EXCEPTION 'Contexto exige salida nueva del mismo documento e ingreso abierto' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$fn$;

CREATE FUNCTION public.fn_mp_confirmar_ingreso_final() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.documentos d JOIN public.usuarios u ON u.id=NEW.registrado_por_id
  WHERE d.id=NEW.documento_id AND d.activo AND d.estado_tramite='PENDIENTE_DECISION'
   AND d.responsable_actual_id=NEW.registrado_por_id AND d.oficina_responsable_id=u.oficina_id
   AND d.destinatario_autorizado_id IS NULL) THEN
  RAISE EXCEPTION 'Ingreso y solicitud de decisión deben confirmar juntos su custodia' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$fn$;

-- Solo INSERT de movimientos: nunca clasifica movimientos históricos. Mantiene
-- contexto de trámites abiertos incluso si luego se desactiva la interfaz nueva.
-- Invoker, sin privilegios elevados: usa el actor ya validado por el circuito.
CREATE FUNCTION public.fn_mp_contextualizar_salida() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE anterior text:=current_setting('app.primer_ingreso_operacion',true);
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.documentos d JOIN public.tipos_documentales td ON td.id=d.tipo_documental_id
  WHERE d.id=NEW.documento_id AND NOT td.requiere_clave AND lower(btrim(td.nombre))<>'síseve') THEN RETURN NULL; END IF;
 PERFORM set_config('app.primer_ingreso_operacion','SALIDA',true);
 INSERT INTO public.movimientos_ingresos(movimiento_id,ingreso_id,documento_id,vinculado_por_id,fecha_vinculacion,motivo)
 SELECT NEW.id,i.id,NEW.documento_id,NEW.registrado_por_id,clock_timestamp(),'Salida física del ingreso ordinario abierto'
 FROM public.ingresos_mesa_partes i WHERE i.documento_id=NEW.documento_id AND i.fecha_conclusion IS NULL AND i.fecha_invalidacion IS NULL;
 PERFORM set_config('app.primer_ingreso_operacion',coalesce(anterior,''),true);
 RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_ai_auditoria_desde_trigger() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF TG_OP<>'INSERT' OR pg_trigger_depth()<2
 OR NEW.usuario_actor_id::text IS DISTINCT FROM current_setting('app.usuario_actor_id',true) THEN
  RAISE EXCEPTION 'Auditoría solo desde una operación autorizada' USING ERRCODE='55000';
 END IF;
 IF NEW.tabla IN ('archivos_institucionales','archivos_asignaciones') AND public.fn_ai_admin_autorizado() THEN RETURN NEW;
 ELSIF NEW.tabla='documentos_archivos' AND NEW.accion='CREAR' AND EXISTS
  (SELECT 1 FROM public.documentos_archivos da WHERE da.id=NEW.registro_id AND da.vinculado_por_id=NEW.usuario_actor_id
  AND public.fn_ai_documento_ordinario_visible(da.documento_id)) THEN RETURN NEW;
 ELSIF NEW.tabla='ingresos_mesa_partes' AND NEW.accion='CREAR' AND public.fn_mp_mesa_autorizada() AND EXISTS
  (SELECT 1 FROM public.ingresos_mesa_partes i WHERE i.id=NEW.registro_id AND i.registrado_por_id=NEW.usuario_actor_id) THEN RETURN NEW;
 ELSIF NEW.tabla='movimientos_ingresos' AND NEW.accion='CREAR' AND EXISTS
  (SELECT 1 FROM public.movimientos_ingresos mi WHERE mi.id=NEW.registro_id AND mi.vinculado_por_id=NEW.usuario_actor_id
  AND public.fn_mp_recorrido_visible(mi.documento_id)) THEN RETURN NEW;
 END IF;
 RAISE EXCEPTION 'Auditoría fuera del alcance habilitado' USING ERRCODE='55000';
END;
$fn$;

DROP TRIGGER aa_ai_modelo_dormido ON public.ingresos_mesa_partes;
DROP TRIGGER aa_ai_modelo_dormido ON public.movimientos_ingresos;
-- La validación anterior de ESTA relación nueva usaba FOR UPDATE del ingreso.
-- Se sustituye por la validación más acotada de arriba: mismo cerrojo y bloqueo
-- documental, mismas FK/fechas/actor y solo salidas nuevas. No necesita conceder
-- UPDATE ni una política de modificación sobre la historia del ingreso.
DROP TRIGGER ai_validar_relacion ON public.movimientos_ingresos;
CREATE TRIGGER aa_mp_primera_presentacion BEFORE INSERT OR UPDATE OR DELETE ON public.ingresos_mesa_partes
 FOR EACH ROW EXECUTE FUNCTION public.fn_mp_validar_primera_presentacion();
CREATE TRIGGER aa_mp_primera_presentacion BEFORE INSERT OR UPDATE OR DELETE ON public.movimientos_ingresos
 FOR EACH ROW EXECUTE FUNCTION public.fn_mp_validar_primera_presentacion();
CREATE CONSTRAINT TRIGGER ct_mp_ingreso_final AFTER INSERT ON public.ingresos_mesa_partes
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.fn_mp_confirmar_ingreso_final();
CREATE TRIGGER mp_contexto_nueva_salida AFTER INSERT ON public.movimientos_documentales
 FOR EACH ROW EXECUTE FUNCTION public.fn_mp_contextualizar_salida();

CREATE POLICY mp_documento_recibible ON public.documentos_archivos FOR SELECT TO sistema_web_app
 USING(public.fn_mp_destinataria_pendiente(documento_id));
CREATE POLICY mp_ingreso_lectura ON public.ingresos_mesa_partes FOR SELECT TO sistema_web_app
 USING(NOT public.fn_ai_admin_autorizado() AND public.fn_ai_documento_ordinario_visible(documento_id));
CREATE POLICY mp_ingreso_insercion ON public.ingresos_mesa_partes FOR INSERT TO sistema_web_app
 WITH CHECK(public.fn_mp_mesa_autorizada() AND registrado_por_id::text=current_setting('app.usuario_actor_id',true)
  AND public.fn_ai_documento_ordinario_visible(documento_id));
CREATE POLICY mp_contexto_lectura ON public.movimientos_ingresos FOR SELECT TO sistema_web_app
 USING(public.fn_mp_recorrido_visible(documento_id));
CREATE POLICY mp_contexto_insercion ON public.movimientos_ingresos FOR INSERT TO sistema_web_app
 WITH CHECK(vinculado_por_id::text=current_setting('app.usuario_actor_id',true) AND public.fn_ai_documento_ordinario_visible(documento_id));
CREATE POLICY mp_auditoria_insercion ON public.auditoria_archivistica FOR INSERT TO sistema_web_app
 WITH CHECK(usuario_actor_id::text=current_setting('app.usuario_actor_id',true) AND
 ((tabla='ingresos_mesa_partes' AND EXISTS(SELECT 1 FROM public.ingresos_mesa_partes WHERE id=registro_id))
 OR (tabla='movimientos_ingresos' AND EXISTS(SELECT 1 FROM public.movimientos_ingresos WHERE id=registro_id))));
CREATE POLICY mp_auditoria_lectura ON public.auditoria_archivistica FOR SELECT TO sistema_web_app
 USING((tabla='ingresos_mesa_partes' AND EXISTS(SELECT 1 FROM public.ingresos_mesa_partes WHERE id=registro_id))
 OR (tabla='movimientos_ingresos' AND EXISTS(SELECT 1 FROM public.movimientos_ingresos WHERE id=registro_id)));

GRANT SELECT ON public.ingresos_mesa_partes,public.movimientos_ingresos TO sistema_web_app;
GRANT INSERT(documento_id,registrado_por_id,fecha_ingreso,fecha_presentacion,presentante,procedencia,proposito,movimiento_recepcion_id,solicitud_id)
 ON public.ingresos_mesa_partes TO sistema_web_app;
GRANT INSERT(movimiento_id,ingreso_id,documento_id,vinculado_por_id,fecha_vinculacion,motivo)
 ON public.movimientos_ingresos TO sistema_web_app;
GRANT USAGE ON SEQUENCE public.ingresos_mesa_partes_id_seq,public.movimientos_ingresos_id_seq TO sistema_web_app;
DO $privileges$
DECLARE nombre text;
BEGIN
 FOREACH nombre IN ARRAY ARRAY['fn_mp_mesa_autorizada()','fn_mp_destinataria_pendiente(bigint)',
  'fn_mp_recorrido_visible(bigint)','fn_mp_validar_primera_presentacion()',
  'fn_mp_confirmar_ingreso_final()','fn_mp_contextualizar_salida()'] LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION public.'||nombre||' FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||nombre||' TO sistema_web_app';
 END LOOP;
END;
$privileges$;
-- Sin UPDATE/DELETE/TRUNCATE de ingresos, sin permisos sobre actuaciones/relevos/sustituciones.

COMMIT;
