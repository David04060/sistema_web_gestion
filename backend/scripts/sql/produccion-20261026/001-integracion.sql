-- Producción: derivado de archivo-institucional/001-estructura-aditiva.sql
-- SHA256 del origen QA: 8fd361585ef44ca57c62c02d04d4b6aa533b40728a0c6cc464666ccfbaa52a49
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
CREATE TABLE public.archivos_institucionales (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 oficina_id bigint NOT NULL REFERENCES public.oficinas(id) ON DELETE RESTRICT,
 nombre varchar(150) NOT NULL CHECK (btrim(nombre) <> ''),
 responsabilidad text NOT NULL CHECK (btrim(responsabilidad) <> ''),
 creado_por_id bigint NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 fecha_creacion timestamptz NOT NULL CHECK (isfinite(fecha_creacion)),
 motivo text NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 1 AND 1000)
);
CREATE UNIQUE INDEX uq_archivo_oficina_nombre ON public.archivos_institucionales
 (oficina_id, lower(btrim(nombre)));

CREATE TABLE public.archivos_asignaciones (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 archivo_id bigint NOT NULL REFERENCES public.archivos_institucionales(id) ON DELETE RESTRICT,
 responsable_id bigint NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 fecha_inicio timestamptz NOT NULL CHECK (isfinite(fecha_inicio)),
 fecha_fin timestamptz,
 formalizado_por_id bigint NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 motivo text NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 1 AND 1000),
 finalizado_por_id bigint REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 motivo_fin text,
 CONSTRAINT uq_asignacion_archivo UNIQUE (id,archivo_id),
 CONSTRAINT ck_asignacion_fin CHECK (
  (fecha_fin IS NULL AND finalizado_por_id IS NULL AND motivo_fin IS NULL)
  OR (fecha_fin IS NOT NULL AND isfinite(fecha_fin) AND fecha_fin > fecha_inicio
      AND finalizado_por_id IS NOT NULL AND motivo_fin IS NOT NULL
      AND char_length(btrim(motivo_fin)) BETWEEN 1 AND 1000))
);
CREATE UNIQUE INDEX uq_archivo_responsable_vigente
 ON public.archivos_asignaciones(archivo_id) WHERE fecha_fin IS NULL;
CREATE INDEX ix_asignaciones_responsable ON public.archivos_asignaciones(responsable_id);

-- Relacion 0..1 independiente: no agrega campos a to_jsonb(NEW) de documentos
-- ni obliga a actualizar registros antiguos para clasificarlos. No es custodia.
CREATE TABLE public.documentos_archivos (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 documento_id bigint NOT NULL UNIQUE REFERENCES public.documentos(id) ON DELETE RESTRICT,
 archivo_id bigint NOT NULL REFERENCES public.archivos_institucionales(id) ON DELETE RESTRICT,
 vinculado_por_id bigint NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 fecha_vinculacion timestamptz NOT NULL CHECK (isfinite(fecha_vinculacion)),
 fundamento text NOT NULL CHECK (char_length(btrim(fundamento)) BETWEEN 1 AND 1000)
);
CREATE INDEX ix_documentos_archivo ON public.documentos_archivos(archivo_id);

CREATE TABLE public.ingresos_mesa_partes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 documento_id bigint NOT NULL REFERENCES public.documentos(id) ON DELETE RESTRICT,
 registrado_por_id bigint NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 fecha_ingreso timestamptz NOT NULL CHECK (isfinite(fecha_ingreso)),
 presentante varchar(250) NOT NULL CHECK (btrim(presentante) <> ''),
 procedencia text NOT NULL CHECK (btrim(procedencia) <> ''),
 proposito text NOT NULL CHECK (char_length(btrim(proposito)) BETWEEN 1 AND 20000),
 ingreso_anterior_id bigint,
 movimiento_recepcion_id bigint,
 concluido_por_id bigint REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 fecha_conclusion timestamptz,
 motivo_conclusion text,
 resultado text,
 invalidado_por_id bigint REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 fecha_invalidacion timestamptz,
 motivo_invalidacion text,
 CONSTRAINT uq_ingreso_documento UNIQUE(id,documento_id),
 CONSTRAINT fk_ingreso_anterior_mismo_documento
  FOREIGN KEY(ingreso_anterior_id,documento_id)
  REFERENCES public.ingresos_mesa_partes(id,documento_id) ON DELETE RESTRICT,
 CONSTRAINT ck_ingreso_no_autorreferencia CHECK (ingreso_anterior_id IS DISTINCT FROM id),
 CONSTRAINT ck_ingreso_conclusion CHECK (
  (fecha_conclusion IS NULL AND concluido_por_id IS NULL AND motivo_conclusion IS NULL AND resultado IS NULL)
  OR (fecha_conclusion IS NOT NULL AND isfinite(fecha_conclusion) AND fecha_conclusion >= fecha_ingreso
   AND concluido_por_id IS NOT NULL AND motivo_conclusion IS NOT NULL AND resultado IS NOT NULL
   AND char_length(btrim(motivo_conclusion)) BETWEEN 1 AND 1000
   AND char_length(btrim(resultado)) BETWEEN 1 AND 20000)),
 CONSTRAINT ck_ingreso_invalidacion CHECK (
  (fecha_invalidacion IS NULL AND invalidado_por_id IS NULL AND motivo_invalidacion IS NULL)
  OR (fecha_invalidacion IS NOT NULL AND isfinite(fecha_invalidacion) AND fecha_invalidacion >= fecha_ingreso
   AND invalidado_por_id IS NOT NULL AND motivo_invalidacion IS NOT NULL
   AND char_length(btrim(motivo_invalidacion)) BETWEEN 1 AND 1000)),
 CONSTRAINT ck_ingreso_cierre_exclusivo CHECK (fecha_conclusion IS NULL OR fecha_invalidacion IS NULL)
);
CREATE UNIQUE INDEX uq_ingreso_abierto_documento ON public.ingresos_mesa_partes(documento_id)
 WHERE fecha_conclusion IS NULL AND fecha_invalidacion IS NULL;
CREATE INDEX ix_ingreso_anterior ON public.ingresos_mesa_partes(ingreso_anterior_id);

-- Unico cambio estructural sobre tablas previas: clave candidata redundante
-- respecto de la PK. Necesaria para FK compuestas; no modifica ninguna fila.
ALTER TABLE public.movimientos_documentales ADD CONSTRAINT uq_movimiento_identidad_documento
 UNIQUE(id,documento_id);
ALTER TABLE public.ingresos_mesa_partes ADD CONSTRAINT fk_ingreso_recepcion_mismo_documento
 FOREIGN KEY(movimiento_recepcion_id,documento_id)
 REFERENCES public.movimientos_documentales(id,documento_id) ON DELETE RESTRICT;
CREATE INDEX ix_ingreso_recepcion ON public.ingresos_mesa_partes(movimiento_recepcion_id);

-- Una continuacion agrega un hecho al ingreso vigente, no otro ingreso.
CREATE TABLE public.ingresos_actuaciones (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 ingreso_id bigint NOT NULL REFERENCES public.ingresos_mesa_partes(id) ON DELETE RESTRICT,
 registrado_por_id bigint NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 fecha_actuacion timestamptz NOT NULL CHECK (isfinite(fecha_actuacion)),
 descripcion text NOT NULL CHECK (char_length(btrim(descripcion)) BETWEEN 1 AND 20000)
);
CREATE INDEX ix_actuaciones_ingreso ON public.ingresos_actuaciones(ingreso_id,fecha_actuacion,id);

-- Contexto opcional 0..1 por movimiento. Evita editar un movimiento cerrado
-- para contextualizarlo; las dos FK comparten documento_id obligatoriamente.
CREATE TABLE public.movimientos_ingresos (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 movimiento_id bigint NOT NULL UNIQUE,
 ingreso_id bigint NOT NULL,
 documento_id bigint NOT NULL,
 vinculado_por_id bigint NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 fecha_vinculacion timestamptz NOT NULL CHECK (isfinite(fecha_vinculacion)),
 motivo text NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 1 AND 1000),
 FOREIGN KEY(movimiento_id,documento_id)
  REFERENCES public.movimientos_documentales(id,documento_id) ON DELETE RESTRICT,
 FOREIGN KEY(ingreso_id,documento_id)
  REFERENCES public.ingresos_mesa_partes(id,documento_id) ON DELETE RESTRICT
);
CREATE INDEX ix_movimientos_ingreso ON public.movimientos_ingresos(ingreso_id,documento_id);

CREATE TABLE public.archivos_relevos (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 archivo_id bigint NOT NULL REFERENCES public.archivos_institucionales(id) ON DELETE RESTRICT,
 asignacion_saliente_id bigint NOT NULL,
 asignacion_entrante_id bigint NOT NULL UNIQUE,
 formalizado_por_id bigint NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 fecha_formalizacion timestamptz NOT NULL CHECK (isfinite(fecha_formalizacion)),
 motivo text NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 1 AND 1000),
 aceptado_por_id bigint REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 fecha_aceptacion timestamptz,
 CONSTRAINT ck_relevo_distinto CHECK (asignacion_saliente_id <> asignacion_entrante_id),
 FOREIGN KEY(asignacion_saliente_id,archivo_id)
  REFERENCES public.archivos_asignaciones(id,archivo_id) ON DELETE RESTRICT,
 FOREIGN KEY(asignacion_entrante_id,archivo_id)
  REFERENCES public.archivos_asignaciones(id,archivo_id) ON DELETE RESTRICT,
 CONSTRAINT ck_relevo_aceptacion CHECK (
  (aceptado_por_id IS NULL AND fecha_aceptacion IS NULL)
  OR (aceptado_por_id IS NOT NULL AND fecha_aceptacion IS NOT NULL
      AND isfinite(fecha_aceptacion) AND fecha_aceptacion >= fecha_formalizacion))
);
CREATE INDEX ix_relevo_saliente ON public.archivos_relevos(asignacion_saliente_id);

CREATE TABLE public.relevos_documentos (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 relevo_id bigint NOT NULL REFERENCES public.archivos_relevos(id) ON DELETE RESTRICT,
 documento_id bigint NOT NULL REFERENCES public.documentos(id) ON DELETE RESTRICT,
 -- Clase de hecho del inventario, NO estado documental/de circulacion.
 hecho varchar(12) NOT NULL CHECK (hecho IN ('ENTREGA','EXCEPCION')),
 registrado_por_id bigint NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 fecha_registro timestamptz NOT NULL CHECK (isfinite(fecha_registro)),
 motivo text NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 1 AND 1000),
 recibido_por_id bigint REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 fecha_entrega timestamptz,
 archivador_confirmado_id bigint REFERENCES public.archivadores(id) ON DELETE RESTRICT,
 UNIQUE(relevo_id,documento_id),
 CONSTRAINT ck_detalle_relevo_hecho CHECK (
  (hecho='EXCEPCION' AND recibido_por_id IS NULL AND fecha_entrega IS NULL AND archivador_confirmado_id IS NULL)
  OR (hecho='ENTREGA' AND recibido_por_id IS NOT NULL AND fecha_entrega IS NOT NULL
      AND isfinite(fecha_entrega) AND fecha_entrega <= fecha_registro))
);
CREATE INDEX ix_relevo_documento ON public.relevos_documentos(documento_id);

CREATE TABLE public.movimientos_sustituciones (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 relevo_id bigint NOT NULL REFERENCES public.archivos_relevos(id) ON DELETE RESTRICT,
 movimiento_id bigint NOT NULL REFERENCES public.movimientos_documentales(id) ON DELETE RESTRICT,
 -- Una designacion DESTINO cubre recibir O rechazar; ORIGEN recuperar O cancelar.
 intervencion varchar(7) NOT NULL CHECK (intervencion IN ('ORIGEN','DESTINO')),
 usuario_original_id bigint NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 sustituto_id bigint NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 oficina_intervencion_id bigint NOT NULL REFERENCES public.oficinas(id) ON DELETE RESTRICT,
 autorizado_por_id bigint NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 formalizado_por_id bigint NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 fecha_autorizacion timestamptz NOT NULL CHECK (isfinite(fecha_autorizacion)),
 motivo text NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 1 AND 1000),
 fecha_fin timestamptz,
 finalizado_por_id bigint REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 motivo_fin text,
 CONSTRAINT ck_sustituto_distinto CHECK (sustituto_id <> usuario_original_id),
 CONSTRAINT ck_sustitucion_fin CHECK (
  (fecha_fin IS NULL AND finalizado_por_id IS NULL AND motivo_fin IS NULL)
  OR (fecha_fin IS NOT NULL AND isfinite(fecha_fin) AND fecha_fin >= fecha_autorizacion
      AND finalizado_por_id IS NOT NULL AND motivo_fin IS NOT NULL
      AND char_length(btrim(motivo_fin)) BETWEEN 1 AND 1000))
);
CREATE UNIQUE INDEX uq_sustitucion_intervencion_vigente
 ON public.movimientos_sustituciones(movimiento_id,intervencion) WHERE fecha_fin IS NULL;
CREATE INDEX ix_sustitucion_relevo ON public.movimientos_sustituciones(relevo_id);

-- Hecho posterior de quien actuo realmente. Dormido tambien: las restricciones
-- actuales impiden sustituir al actor. Requiere puente futuro atomico, NO se
-- falsea recibido_por_id ni se altera el participante original para habilitarlo.
CREATE TABLE public.sustituciones_actuaciones (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 sustitucion_id bigint NOT NULL UNIQUE REFERENCES public.movimientos_sustituciones(id) ON DELETE RESTRICT,
 actuado_por_id bigint NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 operacion varchar(10) NOT NULL CHECK (operacion IN ('RECIBIR','RECHAZAR','RECUPERAR','CANCELAR')),
 fecha_actuacion timestamptz NOT NULL CHECK (isfinite(fecha_actuacion)),
 motivo text NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 1 AND 1000)
);

-- Auditoria separada para no introducir inventarios/documentos protegidos en
-- consultas administrativas heredadas de historial_modificaciones.
-- No guarda valores, inventarios ni motivos en claro (solo campos modificados).
CREATE TABLE public.auditoria_archivistica (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tabla varchar(63) NOT NULL,
 registro_id bigint NOT NULL,
 accion varchar(10) NOT NULL CHECK (accion IN ('CREAR','MODIFICAR')),
 usuario_actor_id bigint NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 fecha timestamptz NOT NULL DEFAULT clock_timestamp(),
 campos_modificados jsonb NOT NULL CHECK (jsonb_typeof(campos_modificados)='object')
);
CREATE INDEX ix_auditoria_archivistica_registro
 ON public.auditoria_archivistica(tabla,registro_id,fecha,id);

CREATE FUNCTION public.fn_ai_bloquear_uso() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
 RAISE EXCEPTION 'Modelo archivistico preparado; uso pendiente de backend y habilitacion revisada'
  USING ERRCODE='55000';
END;
$fn$;
CREATE FUNCTION public.fn_ai_bloquear_borrado() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
 RAISE EXCEPTION 'No se elimina ni trunca historia archivistica' USING ERRCODE='23514';
END;
$fn$;

CREATE FUNCTION public.fn_ai_auditar() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE actor record; cambios jsonb;
BEGIN
 SELECT * INTO actor FROM public.fn_documental_actor();
 SELECT coalesce(jsonb_object_agg(n.key,jsonb_build_object('modificado',true)),'{}'::jsonb)
 INTO cambios FROM jsonb_each(to_jsonb(NEW)) n
 WHERE TG_OP='INSERT' OR n.value IS DISTINCT FROM (to_jsonb(OLD)->n.key);
 IF cambios='{}'::jsonb THEN RETURN NULL; END IF;
 INSERT INTO public.auditoria_archivistica(tabla,registro_id,accion,usuario_actor_id,campos_modificados)
 VALUES(TG_TABLE_NAME,NEW.id,CASE WHEN TG_OP='INSERT' THEN 'CREAR' ELSE 'MODIFICAR' END,actor.id,cambios);
 RETURN NULL;
END;
$fn$;

DO $install$
DECLARE tabla text;
BEGIN
 FOREACH tabla IN ARRAY ARRAY['archivos_institucionales','archivos_asignaciones',
  'documentos_archivos','ingresos_mesa_partes','ingresos_actuaciones','movimientos_ingresos',
  'archivos_relevos','relevos_documentos','movimientos_sustituciones',
  'sustituciones_actuaciones','auditoria_archivistica'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tabla);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tabla);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',tabla);
  EXECUTE format('CREATE TRIGGER aa_ai_modelo_dormido BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_ai_bloquear_uso()',tabla);
  EXECUTE format('CREATE TRIGGER ai_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.fn_ai_bloquear_borrado()',tabla);
  IF tabla='auditoria_archivistica' THEN
   EXECUTE format('CREATE TRIGGER ai_historial_inmutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_ai_bloquear_borrado()',tabla);
  ELSE
   EXECUTE format('CREATE TRIGGER ai_no_borrado BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_ai_bloquear_borrado()',tabla);
   EXECUTE format('CREATE TRIGGER ai_auditoria AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_ai_auditar()',tabla);
  END IF;
 END LOOP;
END;
$install$;
-- No GRANT, politicas RLS, SECURITY DEFINER, datos iniciales ni habilitacion.
-- Antes de abrir uso: revisar tambien privilegios por defecto y secuencias con
-- la identidad REAL del runtime. RLS no protege contra superusuario/BYPASSRLS.

COMMIT;
