-- PREPARADO; NO EJECUTADO NI VALIDADO EN POSTGRESQL. Aplicar despues de 001.
-- Completa invariantes del esquema DORMIDO; NO quita aa_ai_modelo_dormido,
-- NO crea politicas RLS ni concede privilegios, NO habilita operaciones.
-- Diferible aqui significa comprobacion al COMMIT, no permiso para usarlo.
-- PENDIENTE DE OTRA FASE (no se implementa con este SQL):
--  * roles y alcance por archivo/ingreso + filtros protegidos en backend;
--  * puente de entrega de relevo y sustituciones con custodia/movimiento;
--  * contextualizar obligatoriamente nuevas salidas de un ingreso vigente;
--  * migracion revisada de las validaciones antiguas del actor original;
--  * politicas/privilegios minimos y retirada deliberada del bloqueo de uso.
-- No se puede aplicar una exigencia de contexto a la aplicacion anterior:
-- sus INSERT de movimientos no escriben movimientos_ingresos.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(hashtext('administracion-institucional'));
DO $guard$
BEGIN
 IF nullif(current_setting('app.migracion_base_esperada',true),'') IS DISTINCT FROM current_database() THEN
  RAISE EXCEPTION 'Base destino no confirmada';
 END IF;
 IF nullif(current_setting('neon.branch_id',true),'') IS NOT NULL AND
    nullif(current_setting('neon.branch_id',true),'') IS DISTINCT FROM
    nullif(current_setting('app.migracion_rama_esperada',true),'') THEN
  RAISE EXCEPTION 'Rama destino no confirmada';
 END IF;
 IF to_regclass('public.auditoria_archivistica') IS NULL
    OR to_regprocedure('public.fn_ai_bloquear_uso()') IS NULL THEN
  RAISE EXCEPTION 'Falta 001 completo';
 END IF;
 IF to_regprocedure('public.fn_ai_validar_relacion()') IS NOT NULL THEN
  RAISE EXCEPTION '002 ya aplicado o esquema parcial: inspeccionar';
 END IF;
END;
$guard$;

-- Los futuros servicios deben adquirir el mismo advisory lock ANTES de filas.
-- El trigger es segunda barrera. Cada relacion documental bloquea el documento;
-- asi se coordina con fn_movimientos_validar_salida y cierres concurrentes.
CREATE FUNCTION public.fn_ai_validar_relacion() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE actor record; archivo public.archivos_institucionales%ROWTYPE;
        ingreso public.ingresos_mesa_partes%ROWTYPE;
        anterior public.ingresos_mesa_partes%ROWTYPE;
        relevo public.archivos_relevos%ROWTYPE;
        saliente public.archivos_asignaciones%ROWTYPE;
        entrante public.archivos_asignaciones%ROWTYPE;
        movimiento public.movimientos_documentales%ROWTYPE;
        sustitucion public.movimientos_sustituciones%ROWTYPE;
        doc bigint; oficina bigint; titular bigint; fin timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('administracion-institucional'));
 SELECT * INTO actor FROM public.fn_documental_actor();

 IF TG_TABLE_NAME='archivos_institucionales' THEN
  IF actor.rol <> 'Administrador' THEN
   RAISE EXCEPTION 'Solo Administrador administra archivos' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' AND NEW.creado_por_id<>actor.id THEN
   RAISE EXCEPTION 'Actor de creacion incompatible' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND ROW(NEW.id,NEW.oficina_id,NEW.creado_por_id,NEW.fecha_creacion)
    IS DISTINCT FROM ROW(OLD.id,OLD.oficina_id,OLD.creado_por_id,OLD.fecha_creacion) THEN
   RAISE EXCEPTION 'Identidad, oficina y autoria del archivo son estables' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;

 IF TG_TABLE_NAME='archivos_asignaciones' THEN
  IF actor.rol <> 'Administrador' THEN
   RAISE EXCEPTION 'Solo Administrador formaliza asignaciones' USING ERRCODE='23514';
  END IF;
  SELECT * INTO STRICT archivo FROM public.archivos_institucionales WHERE id=NEW.archivo_id FOR UPDATE;
  IF TG_OP='INSERT' THEN
   IF NEW.formalizado_por_id<>actor.id OR NEW.fecha_fin IS NOT NULL THEN
    RAISE EXCEPTION 'Una asignacion nueva exige actor real y no inventa un cierre historico' USING ERRCODE='23514';
   END IF;
   PERFORM 1 FROM public.usuarios WHERE id=NEW.responsable_id AND activo
    AND oficina_id=archivo.oficina_id FOR SHARE;
   IF NOT FOUND THEN
    RAISE EXCEPTION 'Responsable activo de la oficina del archivo requerido' USING ERRCODE='23514';
   END IF;
  ELSIF OLD.fecha_fin IS NOT NULL OR NEW.fecha_fin IS NULL OR NEW.finalizado_por_id<>actor.id
   OR (to_jsonb(NEW)-ARRAY['fecha_fin','finalizado_por_id','motivo_fin'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['fecha_fin','finalizado_por_id','motivo_fin']) THEN
   RAISE EXCEPTION 'Solo puede finalizarse una vez la asignacion, sin reescribir su historia' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;

 IF TG_TABLE_NAME='archivos_relevos' THEN
  SELECT * INTO STRICT saliente FROM public.archivos_asignaciones WHERE id=NEW.asignacion_saliente_id;
  SELECT * INTO STRICT entrante FROM public.archivos_asignaciones WHERE id=NEW.asignacion_entrante_id;
  IF saliente.responsable_id=entrante.responsable_id OR saliente.fecha_fin IS NULL
     OR saliente.fecha_fin IS DISTINCT FROM entrante.fecha_inicio THEN
   RAISE EXCEPTION 'Relevo requiere responsables distintos y continuidad entre asignaciones' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
   IF actor.rol<>'Administrador' OR NEW.formalizado_por_id<>actor.id
      OR NEW.aceptado_por_id IS NOT NULL THEN
    RAISE EXCEPTION 'Administrador formaliza; la aceptacion se registra por separado por el entrante' USING ERRCODE='23514';
   END IF;
  ELSIF OLD.fecha_aceptacion IS NOT NULL OR NEW.fecha_aceptacion IS NULL
    OR NEW.aceptado_por_id IS DISTINCT FROM entrante.responsable_id
    OR NEW.aceptado_por_id IS DISTINCT FROM actor.id
    OR (to_jsonb(NEW)-ARRAY['aceptado_por_id','fecha_aceptacion'])
       IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['aceptado_por_id','fecha_aceptacion']) THEN
   RAISE EXCEPTION 'Solo el entrante acepta una vez el relevo sin cambiar su formalizacion' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;

 -- Obtener el documento sin usar nombres/asuntos de inventarios en excepciones.
 IF TG_TABLE_NAME IN ('documentos_archivos','ingresos_mesa_partes','movimientos_ingresos','relevos_documentos') THEN
  doc:=NEW.documento_id;
 ELSIF TG_TABLE_NAME='ingresos_actuaciones' THEN
  SELECT documento_id INTO STRICT doc FROM public.ingresos_mesa_partes WHERE id=NEW.ingreso_id;
 ELSIF TG_TABLE_NAME='movimientos_sustituciones' THEN
  SELECT documento_id INTO STRICT doc FROM public.movimientos_documentales WHERE id=NEW.movimiento_id;
 ELSIF TG_TABLE_NAME='sustituciones_actuaciones' THEN
  SELECT * INTO STRICT sustitucion FROM public.movimientos_sustituciones WHERE id=NEW.sustitucion_id;
  SELECT documento_id INTO STRICT doc FROM public.movimientos_documentales WHERE id=sustitucion.movimiento_id;
 ELSE
  RAISE EXCEPTION 'Tabla no prevista en la integridad archivistica';
 END IF;
 PERFORM id FROM public.documentos WHERE id=doc FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento inexistente' USING ERRCODE='23514'; END IF;

 -- Exigir el contexto restringido verificado por el backend antes de cualquier
 -- relacion que revele un documento protegido. No verifica contrasenas en SQL
 -- ni sustituye la autorizacion individual o la consulta especial de Direccion.
 IF EXISTS (SELECT 1 FROM public.documentos d JOIN public.tipos_documentales td ON td.id=d.tipo_documental_id
  WHERE d.id=doc AND (td.requiere_clave OR lower(btrim(td.nombre))='síseve')
  AND td.id::text IS DISTINCT FROM nullif(current_setting('app.tipo_restringido_id',true),'')) THEN
  RAISE EXCEPTION 'Contexto documental restringido requerido' USING ERRCODE='23514';
 END IF;

 IF TG_TABLE_NAME='documentos_archivos' THEN
  IF TG_OP='UPDATE' THEN
   RAISE EXCEPTION 'Pertenencia inmutable en esta fase; rectificacion requiere procedimiento posterior' USING ERRCODE='23514';
  END IF;
  IF NEW.vinculado_por_id<>actor.id THEN
   RAISE EXCEPTION 'Actor de vinculacion incompatible' USING ERRCODE='23514';
  END IF;
  -- El permiso de clasificar debe comprobarlo el servicio: no se deduce del
  -- creador, rol, estado o la oficina actual. fundamento es obligatorio.
  RETURN NEW;
 END IF;

 IF TG_TABLE_NAME='ingresos_mesa_partes' THEN
  IF actor.rol<>'Secretaria de Dirección' OR actor.oficina IS DISTINCT FROM 'Mesa de Partes' THEN
   RAISE EXCEPTION 'Solo Secretaria de Mesa de Partes registra hechos de ingreso' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
   IF NEW.registrado_por_id<>actor.id OR NEW.fecha_conclusion IS NOT NULL OR NEW.fecha_invalidacion IS NOT NULL THEN
    RAISE EXCEPTION 'El ingreso nuevo no aparenta una conclusion o invalidacion previa' USING ERRCODE='23514';
   END IF;
   PERFORM 1 FROM public.documentos WHERE id=doc AND activo AND responsable_actual_id=actor.id
    AND estado_tramite IN ('RECIBIDO','PENDIENTE_DECISION');
   IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingreso exige custodia confirmada de Secretaria' USING ERRCODE='23514';
   END IF;
   IF EXISTS (SELECT 1 FROM public.movimientos_documentales WHERE documento_id=doc
      AND (estado='EN_TRASLADO' OR (estado='RECHAZADO' AND devolucion_confirmada_por_id IS NULL))) THEN
    RAISE EXCEPTION 'No abrir otro ingreso con circulacion fisica pendiente' USING ERRCODE='23514';
   END IF;
   IF NEW.ingreso_anterior_id IS NOT NULL THEN
    SELECT * INTO STRICT anterior FROM public.ingresos_mesa_partes WHERE id=NEW.ingreso_anterior_id;
    fin:=coalesce(anterior.fecha_conclusion,anterior.fecha_invalidacion);
    IF fin IS NULL OR NEW.fecha_ingreso<=anterior.fecha_ingreso OR NEW.fecha_ingreso<fin THEN
     RAISE EXCEPTION 'El reingreso debe seguir al termino del ingreso anterior' USING ERRCODE='23514';
    END IF;
   END IF;
   IF NEW.movimiento_recepcion_id IS NOT NULL THEN
    SELECT * INTO STRICT movimiento FROM public.movimientos_documentales WHERE id=NEW.movimiento_recepcion_id;
    IF movimiento.estado<>'RECIBIDO' OR movimiento.recibido_por_id<>actor.id
       OR movimiento.fecha_recepcion>NEW.fecha_ingreso THEN
     RAISE EXCEPTION 'Referencia de recepcion incompatible con el ingreso' USING ERRCODE='23514';
    END IF;
   END IF;
  ELSE
   IF OLD.fecha_conclusion IS NOT NULL OR OLD.fecha_invalidacion IS NOT NULL
    OR ROW(NEW.id,NEW.documento_id,NEW.registrado_por_id,NEW.fecha_ingreso,NEW.ingreso_anterior_id,NEW.movimiento_recepcion_id)
       IS DISTINCT FROM ROW(OLD.id,OLD.documento_id,OLD.registrado_por_id,OLD.fecha_ingreso,OLD.ingreso_anterior_id,OLD.movimiento_recepcion_id) THEN
    RAISE EXCEPTION 'Identidad y hechos terminales del ingreso no se reescriben' USING ERRCODE='23514';
   END IF;
   IF NEW.fecha_conclusion IS NOT NULL THEN
    IF NEW.concluido_por_id<>actor.id OR EXISTS (
      SELECT 1 FROM public.movimientos_documentales WHERE documento_id=doc AND
       (estado='EN_TRASLADO' OR (estado='RECHAZADO' AND devolucion_confirmada_por_id IS NULL))) THEN
     RAISE EXCEPTION 'Conclusion exige actor real y ausencia de traslado o recuperacion pendiente' USING ERRCODE='23514';
    END IF;
   END IF;
   IF NEW.fecha_invalidacion IS NOT NULL AND NEW.invalidado_por_id<>actor.id THEN
    RAISE EXCEPTION 'Actor de invalidacion incompatible' USING ERRCODE='23514';
   END IF;
  END IF;
  -- No UPDATE a documentos: concluir/invalidar no anula ni cambia estado.
  RETURN NEW;
 END IF;

 IF TG_TABLE_NAME IN ('movimientos_ingresos','ingresos_actuaciones') THEN
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'El hecho relacionado es inmutable' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT ingreso FROM public.ingresos_mesa_partes WHERE id=NEW.ingreso_id FOR UPDATE;
  IF ingreso.fecha_conclusion IS NOT NULL OR ingreso.fecha_invalidacion IS NOT NULL THEN
   RAISE EXCEPTION 'No agregar hechos a un ingreso terminado' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='ingresos_actuaciones' THEN
   IF actor.rol<>'Secretaria de Dirección' OR actor.oficina IS DISTINCT FROM 'Mesa de Partes'
      OR NEW.registrado_por_id<>actor.id OR NEW.fecha_actuacion<ingreso.fecha_ingreso THEN
    RAISE EXCEPTION 'Continuacion incompatible con actor o fecha' USING ERRCODE='23514';
   END IF;
  ELSE
   SELECT * INTO STRICT movimiento FROM public.movimientos_documentales WHERE id=NEW.movimiento_id;
   IF NEW.vinculado_por_id<>actor.id OR movimiento.fecha_salida<ingreso.fecha_ingreso THEN
    RAISE EXCEPTION 'Contexto de salida incompatible con ingreso o actor' USING ERRCODE='23514';
   END IF;
  END IF;
  RETURN NEW;
 END IF;

 IF TG_TABLE_NAME IN ('relevos_documentos','movimientos_sustituciones') THEN
  SELECT * INTO STRICT relevo FROM public.archivos_relevos WHERE id=NEW.relevo_id;
  SELECT * INTO STRICT saliente FROM public.archivos_asignaciones WHERE id=relevo.asignacion_saliente_id;
  SELECT * INTO STRICT entrante FROM public.archivos_asignaciones WHERE id=relevo.asignacion_entrante_id;
  IF NOT EXISTS (SELECT 1 FROM public.documentos_archivos WHERE documento_id=doc AND archivo_id=relevo.archivo_id) THEN
   RAISE EXCEPTION 'Documento fuera del archivo objeto del relevo' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_TABLE_NAME='relevos_documentos' THEN
  IF TG_OP='UPDATE' OR NEW.registrado_por_id<>actor.id OR NEW.fecha_registro<relevo.fecha_formalizacion THEN
   RAISE EXCEPTION 'Detalle de relevo exige hecho nuevo, fecha y actor reales' USING ERRCODE='23514';
  END IF;
  IF NEW.hecho='ENTREGA' AND (NEW.recibido_por_id<>entrante.responsable_id
    OR NEW.recibido_por_id<>actor.id OR relevo.fecha_aceptacion IS NULL
    OR NEW.fecha_entrega<relevo.fecha_aceptacion
    OR EXISTS (SELECT 1 FROM public.movimientos_documentales WHERE documento_id=doc AND
      (estado='EN_TRASLADO' OR (estado='RECHAZADO' AND devolucion_confirmada_por_id IS NULL)))) THEN
   RAISE EXCEPTION 'Entrega exige aceptacion real del entrante y original sin circulacion pendiente' USING ERRCODE='23514';
  END IF;
  -- NO transfiere custodia. La habilitacion futura debe exigir al COMMIT que
  -- esta entrega y el cambio real de custodia/ubicacion se confirmen juntos.
  RETURN NEW;
 END IF;

 IF TG_TABLE_NAME='movimientos_sustituciones' THEN
  SELECT * INTO STRICT movimiento FROM public.movimientos_documentales WHERE id=NEW.movimiento_id;
  titular:=CASE WHEN NEW.intervencion='DESTINO' THEN movimiento.usuario_destino_id ELSE movimiento.usuario_origen_id END;
  oficina:=CASE WHEN NEW.intervencion='DESTINO' THEN movimiento.oficina_destino_id ELSE movimiento.oficina_origen_id END;
  IF TG_OP='INSERT' THEN
   IF NEW.formalizado_por_id<>actor.id OR NEW.fecha_fin IS NOT NULL
      OR NEW.usuario_original_id<>titular OR titular<>saliente.responsable_id
      OR NEW.sustituto_id<>entrante.responsable_id OR NEW.oficina_intervencion_id<>oficina
      OR NEW.fecha_autorizacion<relevo.fecha_formalizacion
      OR (NEW.intervencion='DESTINO' AND movimiento.estado<>'EN_TRASLADO')
      OR (NEW.intervencion='ORIGEN' AND NOT (movimiento.estado='EN_TRASLADO'
          OR (movimiento.estado='RECHAZADO' AND movimiento.devolucion_confirmada_por_id IS NULL))) THEN
    RAISE EXCEPTION 'Sustitucion fuera de la intervencion pendiente del relevo' USING ERRCODE='23514';
   END IF;
   PERFORM 1 FROM public.usuarios WHERE id=NEW.sustituto_id AND activo AND oficina_id=oficina FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Sustituto activo de la misma oficina requerido' USING ERRCODE='23514'; END IF;
   PERFORM 1 FROM public.usuarios WHERE id=NEW.autorizado_por_id AND activo FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Autorizante institucional activo requerido' USING ERRCODE='23514'; END IF;
   -- El servicio futuro debe verificar competencia del autorizante; no se
   -- presume que ser Administrador o responsable habilite esa autorizacion.
  ELSIF OLD.fecha_fin IS NOT NULL OR NEW.fecha_fin IS NULL OR NEW.finalizado_por_id<>actor.id
    OR (to_jsonb(NEW)-ARRAY['fecha_fin','finalizado_por_id','motivo_fin'])
       IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['fecha_fin','finalizado_por_id','motivo_fin']) THEN
   RAISE EXCEPTION 'Solo puede finalizarse una vez la designacion sin reescribirla' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;

 IF TG_TABLE_NAME='sustituciones_actuaciones' THEN
  IF TG_OP='UPDATE' OR NEW.actuado_por_id<>actor.id OR NEW.actuado_por_id<>sustitucion.sustituto_id
     OR sustitucion.fecha_fin IS NOT NULL OR NEW.fecha_actuacion<sustitucion.fecha_autorizacion
     OR (sustitucion.intervencion='DESTINO' AND NEW.operacion NOT IN ('RECIBIR','RECHAZAR'))
     OR (sustitucion.intervencion='ORIGEN' AND NEW.operacion NOT IN ('RECUPERAR','CANCELAR')) THEN
   RAISE EXCEPTION 'Actuacion ajena a la designacion vigente' USING ERRCODE='23514';
  END IF;
  -- No ejecuta la actuacion. Sigue bloqueada por aa_ai_modelo_dormido hasta
  -- disponer del puente atomico con movimiento/custodia y su validacion final.
  RETURN NEW;
 END IF;
 RETURN NEW;
END;
$fn$;

-- Exactamente una asignacion principal y periodos historicos no superpuestos.
-- El indice parcial de 001 ya impide DOS vigentes incluso con concurrencia.
-- Diferir permite crear archivo+asignacion o cerrar saliente+abrir entrante en
-- una transaccion. La consulta se hace sobre filas finales, no sobre NEW viejo.
CREATE FUNCTION public.fn_ai_validar_asignaciones_finales() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE archivo bigint;
BEGIN
 IF TG_TABLE_NAME='archivos_institucionales' THEN
  archivo:=NEW.id;
 ELSE
  archivo:=NEW.archivo_id;
 END IF;
 PERFORM id FROM public.archivos_institucionales WHERE id=archivo FOR UPDATE;
 IF (SELECT count(*) FROM public.archivos_asignaciones WHERE archivo_id=archivo AND fecha_fin IS NULL)<>1 THEN
  RAISE EXCEPTION 'Cada archivo debe confirmar exactamente un responsable principal vigente' USING ERRCODE='23514';
 END IF;
 IF EXISTS (SELECT 1 FROM public.archivos_asignaciones a JOIN public.archivos_asignaciones b
   ON a.archivo_id=b.archivo_id AND a.id<b.id
   WHERE a.archivo_id=archivo AND tstzrange(a.fecha_inicio,a.fecha_fin,'[)')
    && tstzrange(b.fecha_inicio,b.fecha_fin,'[)')) THEN
  RAISE EXCEPTION 'Asignaciones historicas superpuestas' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$fn$;

DO $install$
DECLARE tabla text;
BEGIN
 FOREACH tabla IN ARRAY ARRAY['archivos_institucionales','archivos_asignaciones',
  'documentos_archivos','ingresos_mesa_partes','ingresos_actuaciones','movimientos_ingresos',
  'archivos_relevos','relevos_documentos','movimientos_sustituciones','sustituciones_actuaciones'] LOOP
  EXECUTE format('CREATE TRIGGER ai_validar_relacion BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_ai_validar_relacion()',tabla);
 END LOOP;
END;
$install$;
CREATE CONSTRAINT TRIGGER ct_ai_archivo_responsable AFTER INSERT OR UPDATE ON public.archivos_institucionales
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.fn_ai_validar_asignaciones_finales();
CREATE CONSTRAINT TRIGGER ct_ai_asignacion_responsable AFTER INSERT OR UPDATE ON public.archivos_asignaciones
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.fn_ai_validar_asignaciones_finales();
COMMIT;
