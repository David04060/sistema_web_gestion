-- Producción: derivado de archivo-institucional/007-habilitar-ciclo-ingresos-ordinarios-qa.sql
-- SHA256 del origen QA: 8e9bd3ad2abc55d7157b7284bec0ae882682c3957fe2274e9e75f98a42832aec
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
-- Evidencias append-only: una versión documental identifica la custodia comprobada.
ALTER TABLE public.ingresos_actuaciones ADD COLUMN tipo text NOT NULL DEFAULT 'CONTINUACION'
 CHECK(tipo IN ('CONTINUACION','EVIDENCIA_RESULTADO'));
ALTER TABLE public.ingresos_actuaciones ADD COLUMN version_documental text;
ALTER TABLE public.ingresos_actuaciones ADD COLUMN custodio_id bigint REFERENCES usuarios(id);
ALTER TABLE public.ingresos_actuaciones ADD COLUMN oficina_id bigint REFERENCES oficinas(id);
ALTER TABLE public.ingresos_actuaciones ADD CONSTRAINT ck_mp_evidencia CHECK
 ((tipo='CONTINUACION' AND version_documental IS NULL AND custodio_id IS NULL AND oficina_id IS NULL)
 OR (tipo='EVIDENCIA_RESULTADO' AND version_documental IS NOT NULL AND custodio_id=registrado_por_id AND oficina_id IS NOT NULL));
ALTER TABLE public.ingresos_mesa_partes ADD COLUMN evidencia_resultado_id bigint REFERENCES ingresos_actuaciones(id);
CREATE INDEX ix_mp_historia ON public.ingresos_mesa_partes(documento_id,id DESC);
CREATE FUNCTION public.fn_mp_original_libre(doc bigint) RETURNS boolean LANGUAGE sql STABLE AS $f$
 SELECT EXISTS(SELECT 1 FROM documentos d WHERE d.id=doc AND d.activo
 AND d.estado_tramite IN ('RECIBIDO','PENDIENTE_DECISION') AND d.destinatario_autorizado_id IS NULL)
 AND NOT EXISTS(SELECT 1 FROM movimientos_documentales m WHERE m.documento_id=doc
 AND (m.estado='EN_TRASLADO' OR (m.estado='RECHAZADO' AND m.devolucion_confirmada_por_id IS NULL)));
$f$;
-- Mantiene el validador 006 para primera presentación y contexto de salidas.
DROP TRIGGER aa_mp_primera_presentacion ON public.ingresos_mesa_partes;
CREATE TRIGGER aa_mp_primera_presentacion BEFORE INSERT ON public.ingresos_mesa_partes
 FOR EACH ROW WHEN (NEW.ingreso_anterior_id IS NULL) EXECUTE FUNCTION public.fn_mp_validar_primera_presentacion();
CREATE FUNCTION public.fn_mp_ciclo() RETURNS trigger LANGUAGE plpgsql AS $f$
DECLARE doc record; actor record; i record; ev record; anterior record; fin timestamptz;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Historia inmutable' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('administracion-institucional'));
 SELECT * INTO actor FROM public.fn_documental_actor();
 IF TG_TABLE_NAME='ingresos_actuaciones' THEN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Actuacion inmutable' USING ERRCODE='23514'; END IF;
  SELECT * INTO i FROM ingresos_mesa_partes WHERE id=NEW.ingreso_id;
  SELECT d.*,d.xmin::text version INTO doc FROM documentos d JOIN tipos_documentales td ON td.id=d.tipo_documental_id
   WHERE d.id=i.documento_id AND NOT td.requiere_clave AND lower(btrim(td.nombre))<>'síseve' FOR UPDATE OF d;
  IF NOT FOUND OR NOT doc.activo OR i.fecha_conclusion IS NOT NULL OR i.fecha_invalidacion IS NOT NULL
   OR NEW.registrado_por_id<>actor.id OR NEW.fecha_actuacion<i.fecha_ingreso
   OR actor.rol='Administrador' THEN RAISE EXCEPTION 'Ingreso no operativo' USING ERRCODE='23514'; END IF;
  IF NEW.tipo='CONTINUACION' THEN
   IF NOT public.fn_mp_mesa_autorizada() AND
    (doc.responsable_actual_id<>actor.id OR doc.oficina_responsable_id<>actor.oficina_id) THEN
    RAISE EXCEPTION 'Actor sin alcance operativo' USING ERRCODE='23514'; END IF;
  ELSE
   IF NOT public.fn_mp_original_libre(doc.id) OR doc.responsable_actual_id<>actor.id OR doc.oficina_responsable_id<>actor.oficina_id
    OR NEW.version_documental IS DISTINCT FROM doc.version OR NEW.custodio_id<>actor.id OR NEW.oficina_id<>actor.oficina_id THEN
    RAISE EXCEPTION 'Evidencia no vigente del custodio' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 SELECT d.* INTO doc FROM documentos d JOIN tipos_documentales td ON td.id=d.tipo_documental_id
 WHERE d.id=NEW.documento_id AND NOT td.requiere_clave AND lower(btrim(td.nombre))<>'síseve' FOR UPDATE OF d;
 IF NOT FOUND OR NOT public.fn_mp_mesa_autorizada() OR NOT public.fn_mp_original_libre(doc.id) THEN
  RAISE EXCEPTION 'Circulacion, autorizacion o documento incompatible' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.evidencia_resultado_id IS NOT NULL THEN RAISE EXCEPTION 'Ingreso nuevo sin desenlace' USING ERRCODE='23514'; END IF;
  IF NEW.ingreso_anterior_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO anterior FROM ingresos_mesa_partes WHERE documento_id=NEW.documento_id ORDER BY id DESC LIMIT 1;
  fin:=coalesce(anterior.fecha_conclusion,anterior.fecha_invalidacion);
  IF anterior.id IS DISTINCT FROM NEW.ingreso_anterior_id OR fin IS NULL OR NEW.fecha_presentacion<fin
   OR NEW.fecha_ingreso<NEW.fecha_presentacion OR NEW.fecha_presentacion IS NULL
   OR current_setting('app.mp_presentacion_confirmada',true) IS DISTINCT FROM 'true'
   OR NEW.registrado_por_id<>actor.id OR doc.responsable_actual_id<>actor.id OR doc.oficina_responsable_id<>actor.oficina_id
   OR NEW.fecha_conclusion IS NOT NULL OR NEW.fecha_invalidacion IS NOT NULL THEN
   RAISE EXCEPTION 'Reingreso sin presentacion actual y antecedente terminal' USING ERRCODE='23514'; END IF;
  IF NEW.movimiento_recepcion_id IS NOT NULL AND NOT EXISTS
   (SELECT 1 FROM movimientos_documentales m WHERE m.id=NEW.movimiento_recepcion_id AND m.documento_id=doc.id
    AND m.estado='RECIBIDO' AND m.recibido_por_id=actor.id AND m.fecha_recepcion>fin
    AND m.id=(SELECT max(id) FROM movimientos_documentales WHERE documento_id=doc.id)
    AND NOT EXISTS(SELECT 1 FROM ingresos_mesa_partes x WHERE x.movimiento_recepcion_id=m.id)) THEN
   RAISE EXCEPTION 'Recepcion antigua o incompatible' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.fecha_conclusion IS NOT NULL OR OLD.fecha_invalidacion IS NOT NULL OR
 (to_jsonb(NEW)-ARRAY['concluido_por_id','fecha_conclusion','motivo_conclusion','resultado','invalidado_por_id','fecha_invalidacion','motivo_invalidacion','evidencia_resultado_id'])
 IS DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['concluido_por_id','fecha_conclusion','motivo_conclusion','resultado','invalidado_por_id','fecha_invalidacion','motivo_invalidacion','evidencia_resultado_id']) THEN
 RAISE EXCEPTION 'Ingreso terminal o historia modificada' USING ERRCODE='23514'; END IF;
 IF NEW.fecha_conclusion IS NOT NULL THEN
  SELECT a.* INTO ev FROM ingresos_actuaciones a JOIN documentos d ON d.id=NEW.documento_id
  WHERE a.id=NEW.evidencia_resultado_id AND a.ingreso_id=NEW.id AND a.tipo='EVIDENCIA_RESULTADO'
   AND a.version_documental=d.xmin::text AND a.custodio_id=d.responsable_actual_id AND a.oficina_id=d.oficina_responsable_id;
  IF NOT FOUND OR NEW.concluido_por_id<>actor.id OR NEW.resultado IS DISTINCT FROM ev.descripcion THEN
   RAISE EXCEPTION 'Conclusion sin evidencia vigente' USING ERRCODE='23514'; END IF;
 ELSIF NEW.fecha_invalidacion IS NULL OR NEW.invalidado_por_id<>actor.id OR NEW.evidencia_resultado_id IS NOT NULL THEN
  RAISE EXCEPTION 'Desenlace obligatorio' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$f$;
CREATE TRIGGER ab_mp_ciclo BEFORE INSERT OR UPDATE OR DELETE ON public.ingresos_mesa_partes
 FOR EACH ROW EXECUTE FUNCTION public.fn_mp_ciclo();
DROP TRIGGER aa_ai_modelo_dormido ON public.ingresos_actuaciones;
DROP TRIGGER ai_validar_relacion ON public.ingresos_actuaciones;
CREATE TRIGGER ab_mp_ciclo BEFORE INSERT OR UPDATE OR DELETE ON public.ingresos_actuaciones
 FOR EACH ROW EXECUTE FUNCTION public.fn_mp_ciclo();
-- ct_mp_ingreso_final se conserva sin cambios: valida únicamente el alta al COMMIT.
-- No se ejecuta en actualizaciones terminales ni al agregar actuaciones posteriores.
-- Cada reingreso confirma su propia custodia y PENDIENTE_DECISION al COMMIT.
CREATE POLICY mp_secretaria_gestion ON ingresos_mesa_partes FOR SELECT TO sistema_web_app
 USING(public.fn_mp_mesa_autorizada() AND registrado_por_id::text=current_setting('app.usuario_actor_id',true));
CREATE POLICY mp_pertenencia_gestion ON documentos_archivos FOR SELECT TO sistema_web_app
 USING(public.fn_mp_mesa_autorizada() AND EXISTS(SELECT 1 FROM ingresos_mesa_partes i
 WHERE i.documento_id=documentos_archivos.documento_id AND i.registrado_por_id::text=current_setting('app.usuario_actor_id',true)));
CREATE POLICY mp_cierre ON ingresos_mesa_partes FOR UPDATE TO sistema_web_app
 USING(public.fn_mp_mesa_autorizada() AND (registrado_por_id::text=current_setting('app.usuario_actor_id',true) OR public.fn_ai_documento_ordinario_visible(documento_id)))
 WITH CHECK(public.fn_mp_mesa_autorizada() AND (registrado_por_id::text=current_setting('app.usuario_actor_id',true) OR public.fn_ai_documento_ordinario_visible(documento_id)));
CREATE POLICY mp_actuaciones_lectura ON ingresos_actuaciones FOR SELECT TO sistema_web_app
 USING(EXISTS(SELECT 1 FROM ingresos_mesa_partes i WHERE i.id=ingreso_id));
CREATE POLICY mp_actuaciones_insercion ON ingresos_actuaciones FOR INSERT TO sistema_web_app
 WITH CHECK(registrado_por_id::text=current_setting('app.usuario_actor_id',true)
 AND EXISTS(SELECT 1 FROM ingresos_mesa_partes i WHERE i.id=ingreso_id));
GRANT SELECT ON ingresos_actuaciones TO sistema_web_app;
GRANT INSERT(ingreso_id,registrado_por_id,fecha_actuacion,descripcion,tipo,version_documental,custodio_id,oficina_id)
 ON ingresos_actuaciones TO sistema_web_app;
GRANT INSERT(ingreso_anterior_id) ON ingresos_mesa_partes TO sistema_web_app;
GRANT UPDATE(concluido_por_id,fecha_conclusion,motivo_conclusion,resultado,invalidado_por_id,fecha_invalidacion,motivo_invalidacion,evidencia_resultado_id)
 ON ingresos_mesa_partes TO sistema_web_app;
GRANT USAGE ON SEQUENCE ingresos_actuaciones_id_seq TO sistema_web_app;
CREATE POLICY mp_actuaciones_auditoria_lectura ON auditoria_archivistica FOR SELECT TO sistema_web_app
 USING(tabla='ingresos_actuaciones' AND EXISTS(SELECT 1 FROM ingresos_actuaciones a WHERE a.id=registro_id));
CREATE POLICY mp_actuaciones_auditoria_insert ON auditoria_archivistica FOR INSERT TO sistema_web_app
 WITH CHECK(tabla='ingresos_actuaciones' AND usuario_actor_id::text=current_setting('app.usuario_actor_id',true)
 AND EXISTS(SELECT 1 FROM ingresos_actuaciones a WHERE a.id=registro_id));
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
 ELSIF NEW.tabla='ingresos_actuaciones' AND NEW.accion='CREAR' AND EXISTS
 (SELECT 1 FROM ingresos_actuaciones a WHERE a.id=NEW.registro_id AND a.registrado_por_id=NEW.usuario_actor_id) THEN RETURN NEW;
 ELSIF NEW.tabla='ingresos_mesa_partes' AND NEW.accion IN ('CREAR','MODIFICAR') AND public.fn_mp_mesa_autorizada() AND EXISTS
  (SELECT 1 FROM public.ingresos_mesa_partes i WHERE i.id=NEW.registro_id AND (i.registrado_por_id=NEW.usuario_actor_id OR i.concluido_por_id=NEW.usuario_actor_id OR i.invalidado_por_id=NEW.usuario_actor_id)) THEN RETURN NEW;
 ELSIF NEW.tabla='movimientos_ingresos' AND NEW.accion='CREAR' AND EXISTS
  (SELECT 1 FROM public.movimientos_ingresos mi WHERE mi.id=NEW.registro_id AND mi.vinculado_por_id=NEW.usuario_actor_id
  AND public.fn_mp_recorrido_visible(mi.documento_id)) THEN RETURN NEW;
 END IF;
 RAISE EXCEPTION 'Auditoría fuera del alcance habilitado' USING ERRCODE='55000';
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_mp_ciclo(),public.fn_mp_original_libre(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_mp_ciclo(),public.fn_mp_original_libre(bigint) TO sistema_web_app;

-- Solo la entrega posterior al desenlace puede contextualizar una nueva presentación.
-- El índice UNIQUE de movimiento impide trasladar un contexto histórico al reingreso.
CREATE OR REPLACE FUNCTION public.fn_mp_validar_primera_presentacion() RETURNS trigger LANGUAGE plpgsql AS $fn$
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
  IF modo='REINGRESO_RECEPCION' THEN
   SELECT m.* INTO recepcion FROM movimientos_documentales m WHERE m.id=NEW.movimiento_id;
   SELECT i.*,i.xmin transaccion INTO ingreso FROM ingresos_mesa_partes i WHERE i.id=NEW.ingreso_id;
   IF NOT FOUND OR NOT public.fn_mp_mesa_autorizada() OR NEW.vinculado_por_id<>actor.id
    OR ingreso.transaccion IS DISTINCT FROM pg_current_xact_id()::xid OR ingreso.ingreso_anterior_id IS NULL
    OR ingreso.documento_id<>doc.id OR ingreso.movimiento_recepcion_id IS DISTINCT FROM recepcion.id
    OR NEW.movimiento_id IS DISTINCT FROM recepcion.id OR recepcion.documento_id<>doc.id
    OR recepcion.estado<>'RECIBIDO' OR recepcion.recibido_por_id IS DISTINCT FROM actor.id
    OR doc.responsable_actual_id<>actor.id OR doc.oficina_responsable_id<>actor.oficina_id
    OR NOT public.fn_mp_original_libre(doc.id) OR NOT EXISTS
     (SELECT 1 FROM ingresos_mesa_partes previo WHERE previo.id=ingreso.ingreso_anterior_id
      AND recepcion.fecha_recepcion>coalesce(previo.fecha_conclusion,previo.fecha_invalidacion)) THEN
    RAISE EXCEPTION 'Contexto de nueva presentacion incompatible' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
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
CREATE FUNCTION public.fn_mp_contexto_presentacion_final() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
 IF NEW.ingreso_anterior_id IS NOT NULL AND NEW.movimiento_recepcion_id IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM movimientos_ingresos mi WHERE mi.ingreso_id=NEW.id AND mi.movimiento_id=NEW.movimiento_recepcion_id) THEN
 RAISE EXCEPTION 'Presentacion recibida exige su contexto de reingreso' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END;
$f$;
CREATE CONSTRAINT TRIGGER ct_mp_presentacion_contexto AFTER INSERT ON ingresos_mesa_partes
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.fn_mp_contexto_presentacion_final();
REVOKE ALL ON FUNCTION public.fn_mp_contexto_presentacion_final() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_mp_contexto_presentacion_final() TO sistema_web_app;


COMMIT;
