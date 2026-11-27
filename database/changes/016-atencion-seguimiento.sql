-- 26/11/2026. Ejecutar una sola vez sobre el esquema vigente, dentro de una transacción.
BEGIN;
ALTER TABLE public.delegaciones_documento ADD COLUMN id bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE public.delegaciones_documento DROP CONSTRAINT delegaciones_documento_pkey;
ALTER TABLE public.delegaciones_documento ADD PRIMARY KEY(id);
CREATE INDEX delegaciones_documento_recorrido ON public.delegaciones_documento(documento_id,delegado_en,id);
CREATE INDEX delegaciones_documento_destinatario ON public.delegaciones_documento(usuario_indicado_id,documento_id);
-- Antes de insertar, verifica actor, situación y destino compatible. Permite delegaciones sucesivas sin
-- cambio de ámbito.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE OR REPLACE FUNCTION public.validar_delegacion ()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  d documentos%ROWTYPE;
  rol smallint;
  oficina bigint;
  nombre_persona text;
  titular bigint;
BEGIN
  SELECT
    *
  INTO
    d
  FROM
    documentos
  WHERE
    id = NEW.documento_id
  FOR UPDATE;
  IF d.id IS NULL OR d.situacion NOT IN ('PENDIENTE_DIRECCION', 'EN_MESA_DE_PARTES', 'PERSONAL',
    'GUARDADO_DIRECCION', 'DELEGADO') THEN
    RAISE EXCEPTION 'Documento no delegable';
  END IF;
  SELECT
    rol_id
  INTO
    rol
  FROM
    usuarios
  WHERE
    id = NEW.delegado_por
    AND activo;
  SELECT
    l.propietario_id
  INTO
    titular
  FROM
    ubicaciones_documento u
    JOIN unidades_ubicacion l ON l.id = u.unidad_id
  WHERE
    u.documento_id = d.id
    AND u.vigente
  FOR UPDATE
    OF u FOR SHARE OF l;
  IF titular IS NOT NULL AND titular <> NEW.delegado_por THEN
    RAISE EXCEPTION 'Ubicación vigente ajena';
  END IF;
  IF ((d.situacion='DELEGADO' AND (d.registrado_por=NEW.delegado_por OR public.documento_delegado_por(NEW.delegado_por,d.id) IS NOT NULL)) OR (d.situacion IN ('PENDIENTE_DIRECCION', 'GUARDADO_DIRECCION') AND rol = 3 AND (d.situacion <>
    'GUARDADO_DIRECCION' OR
    titular = NEW.delegado_por) AND EXISTS (
  SELECT
    1
  FROM
    miembros_ambito m
  WHERE
    m.usuario_id = NEW.delegado_por
      AND m.ambito_id = d.ambito_id)) OR (d.situacion = 'EN_MESA_DE_PARTES' AND rol = 4 AND d.registrado_por =
	NEW.delegado_por) OR (d.situacion = 'PERSONAL' AND rol = 5 AND d.registrado_por =
	NEW.delegado_por)) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Actor sin permiso para delegar';
  END IF;
  IF NEW.delegado_por IS DISTINCT FROM nullif(current_setting('app.actor_id',true),'')::bigint OR rol NOT IN (3,4,5) THEN
    RAISE EXCEPTION 'Actor de delegación incompatible';
  END IF;
  IF NEW.usuario_indicado_id IS NOT NULL THEN
    SELECT
      u.oficina_id,
      u.nombre || ' ' || u.apellido
    INTO
      oficina,
      nombre_persona
    FROM
      usuarios u
    WHERE
      u.id = NEW.usuario_indicado_id
      AND u.activo AND u.rol_id IN (3,4,5);
    IF nombre_persona IS NULL OR (NEW.oficina_indicada_id IS NOT NULL AND oficina IS DISTINCT FROM
      NEW.oficina_indicada_id) OR NEW.nombre_persona_guardado IS DISTINCT FROM nombre_persona THEN
      RAISE EXCEPTION 'Persona u oficina indicada incompatible';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- Devuelve el nombre del emisor para una cuenta destinataria elegible; NULL significa que no hay acceso por
-- esta delegación.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE OR REPLACE FUNCTION public.documento_delegado_por (actor bigint, doc bigint)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
  AS $$
  SELECT
    concat_ws(' ', emisor.nombre, emisor.apellido)
  FROM
    public.delegaciones_documento e
    JOIN public.documentos d ON d.id = e.documento_id
      AND d.situacion = 'DELEGADO'
    JOIN public.usuarios u ON u.id = e.usuario_indicado_id
      AND u.activo
    JOIN public.usuarios emisor ON emisor.id = e.delegado_por
  WHERE
    e.documento_id = doc
    AND u.id = actor
    AND u.id <> d.registrado_por
    AND (u.rol_id = 5
      OR (u.rol_id IN (3, 4)
        AND u.oficina_id IS NOT NULL))
  ORDER BY e.delegado_en DESC,e.id DESC LIMIT 1
$$;

-- Trigger diferido: comprueba al confirmar que situación y hechos de delegación/ubicación sean coherentes.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE OR REPLACE FUNCTION public.validar_estado_final ()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  actual text;
  n integer;
BEGIN
  SELECT
    situacion
  INTO
    actual
  FROM
    documentos
  WHERE
    id = NEW.id;
  IF actual = 'DELEGADO' THEN
    SELECT
      count(*)
    INTO
      n
    FROM
      delegaciones_documento
    WHERE
      documento_id = NEW.id;
    IF n < 1 THEN
      RAISE EXCEPTION 'Delegación sin hecho asociado';
    END IF;
  ELSIF actual = 'GUARDADO_DIRECCION' THEN
    SELECT
      count(*)
    INTO
      n
    FROM
      ubicaciones_documento u
      JOIN unidades_ubicacion lugar ON lugar.id = u.unidad_id
      JOIN usuarios propietario ON propietario.id = lugar.propietario_id
    WHERE
      u.documento_id = NEW.id
      AND u.vigente
      AND propietario.rol_id = 3;
    IF n < 1 THEN
      RAISE EXCEPTION 'Guardado en Dirección sin ubicación';
    END IF;
  END IF;
  RETURN NULL;
END
$$;

-- Valida origen y nuevo documento, acceso y ausencia de autorreferencias/ciclos antes de crear la relación.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE OR REPLACE FUNCTION public.validar_relacion ()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog', 'public'
  AS $$
DECLARE
  hijo public.documentos%ROWTYPE;
  actor bigint;
BEGIN
  actor := nullif (current_setting('app.actor_id', true), '')::bigint;
  SELECT
    *
  INTO
    hijo
  FROM
    public.documentos
  WHERE
    id = NEW.documento_id FOR SHARE;
  PERFORM
    1
  FROM
    public.documentos
  WHERE
    id = NEW.origen_id FOR SHARE;
  IF hijo.id IS NULL OR actor IS DISTINCT FROM NEW.creado_por OR hijo.registrado_por IS DISTINCT FROM actor
    OR hijo.situacion = 'ANULADO' OR public.documento_periodo_cerrado (hijo.id) OR NOT
    (EXISTS(SELECT 1 FROM documentos origen WHERE origen.id=NEW.origen_id AND origen.registrado_por=actor) OR public.documento_delegado_por(actor,NEW.origen_id) IS NOT NULL) OR EXISTS (
    SELECT
      1
    FROM
      public.documentos
    WHERE
      id = NEW.origen_id
      AND situacion = 'ANULADO') THEN
    RAISE EXCEPTION 'Origen no consultable o autor incompatible';
  END IF;
  IF NEW.documento_id = NEW.origen_id OR EXISTS ( WITH RECURSIVE cadena (
      id
    ) AS (
    SELECT
      NEW.origen_id
    UNION
    SELECT
      r.origen_id
    FROM
      public.documentos_relaciones r
      JOIN cadena c ON r.documento_id = c.id
    )
    SELECT
      1
    FROM
      cadena
    WHERE
      id = NEW.documento_id) THEN
    RAISE EXCEPTION 'Ciclo documental';
  END IF;
  RETURN NEW;
END
$$;

SET LOCAL search_path TO public,pg_catalog;
-- Acciones independientes: sin estados de atención, sin oficina obligatoria ni límite de cantidad.
CREATE TABLE public.acciones_documento (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 documento_id bigint NOT NULL REFERENCES public.documentos(id),
 responsable_id bigint NOT NULL REFERENCES public.usuarios(id),
 oficina_id bigint REFERENCES public.oficinas(id),
 oficina_nombre text,
 descripcion text NOT NULL CHECK(length(btrim(descripcion)) BETWEEN 1 AND 20000),
 creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 actualizado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 pdf_clave text UNIQUE,
 pdf_nombre text,
 pdf_tamano integer,
 CHECK ((pdf_clave IS NULL AND pdf_nombre IS NULL AND pdf_tamano IS NULL) OR
 (pdf_clave IS NOT NULL AND pdf_nombre IS NOT NULL AND pdf_tamano BETWEEN 1 AND 15728640))
);
CREATE INDEX acciones_documento_recorrido ON public.acciones_documento(documento_id,creado_en,id);
-- Intenciones durables; las claves finales nunca se exponen mediante URL de carga.
CREATE TABLE public.acciones_pdf_cargas (
 id uuid PRIMARY KEY,
 documento_id bigint NOT NULL REFERENCES public.documentos(id),
 actor_id bigint NOT NULL REFERENCES public.usuarios(id),
 temporal text NOT NULL UNIQUE,
 definitiva text NOT NULL UNIQUE,
 nombre text NOT NULL,
 tamano integer NOT NULL CHECK(tamano BETWEEN 1 AND 15728640),
 vence_en timestamptz NOT NULL,
 accion_id bigint REFERENCES public.acciones_documento(id),
 confirmada_en timestamptz
);
CREATE INDEX acciones_pdf_cargas_pendientes ON public.acciones_pdf_cargas(actor_id,vence_en) WHERE confirmada_en IS NULL;

-- El autor y su oficina se obtienen en PostgreSQL; una corrección mantiene la identidad original.
CREATE FUNCTION public.validar_accion_documental() RETURNS trigger LANGUAGE plpgsql SET search_path TO pg_catalog,public AS $$
DECLARE actor bigint; d documentos%ROWTYPE; u usuarios%ROWTYPE;
BEGIN
 actor:=nullif(current_setting('app.actor_id',true),'')::bigint;
 SELECT * INTO d FROM documentos WHERE id=NEW.documento_id FOR UPDATE;
 SELECT * INTO u FROM usuarios WHERE id=actor AND activo;
 IF d.id IS NULL OR d.situacion='ANULADO' OR documento_periodo_cerrado(d.id)
 OR u.id IS NULL OR documento_delegado_por(actor,d.id) IS NULL THEN
  RAISE EXCEPTION 'Acción documental no autorizada' USING ERRCODE='42501';
 END IF;
 IF TG_OP='INSERT' THEN
  NEW.responsable_id:=actor; NEW.oficina_id:=u.oficina_id;
  SELECT nombre INTO NEW.oficina_nombre FROM oficinas WHERE id=u.oficina_id;
  NEW.creado_en:=clock_timestamp(); NEW.actualizado_en:=NEW.creado_en; NEW.revision:=1;
 ELSE
  IF OLD.responsable_id<>actor OR (NEW.id,NEW.documento_id,NEW.responsable_id,NEW.oficina_id,NEW.oficina_nombre,NEW.creado_en)
   IS DISTINCT FROM (OLD.id,OLD.documento_id,OLD.responsable_id,OLD.oficina_id,OLD.oficina_nombre,OLD.creado_en) THEN
   RAISE EXCEPTION 'Solo el autor corrige su acción sin alterar su identidad' USING ERRCODE='42501';
  END IF;
  NEW.revision:=OLD.revision+1; NEW.actualizado_en:=clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validar_accion_documental BEFORE INSERT OR UPDATE ON acciones_documento FOR EACH ROW EXECUTE FUNCTION validar_accion_documental();

-- La corrección actualiza la misma acción y registra el antes/después en la auditoría existente.
CREATE FUNCTION public.auditar_accion_documental() RETURNS trigger LANGUAGE plpgsql SET search_path TO pg_catalog,public AS $$
DECLARE antes jsonb; despues jsonb;
BEGIN
 IF TG_OP='UPDATE' THEN
  antes:=jsonb_build_object('accion_id',OLD.id::text,'descripcion',OLD.descripcion,'pdf_nombre',OLD.pdf_nombre);
  IF OLD.pdf_clave IS DISTINCT FROM NEW.pdf_clave AND OLD.pdf_clave IS NOT NULL THEN
   INSERT INTO pdf_objetos_pendientes(clave_r2,documento_id,limpiar_desde) VALUES(OLD.pdf_clave,OLD.documento_id,clock_timestamp())
   ON CONFLICT(clave_r2) DO UPDATE SET limpiar_desde=clock_timestamp();
  END IF;
 END IF;
 despues:=jsonb_build_object('accion_id',NEW.id::text,'descripcion',NEW.descripcion,'pdf_nombre',NEW.pdf_nombre);
 INSERT INTO auditoria_documental(documento_id,actor_id,accion,motivo,anterior,posterior)
 VALUES(NEW.documento_id,NEW.responsable_id,CASE WHEN TG_OP='INSERT' THEN 'ACCION_REGISTRADA' ELSE 'ACCION_CORREGIDA' END,
 current_setting('app.motivo',true),antes,despues);
 RETURN NULL;
END $$;
CREATE TRIGGER auditar_accion_documental AFTER INSERT OR UPDATE ON acciones_documento FOR EACH ROW EXECUTE FUNCTION auditar_accion_documental();
CREATE TRIGGER proteger_acciones BEFORE DELETE ON acciones_documento FOR EACH ROW EXECUTE FUNCTION impedir_cambio_historico();
CREATE TRIGGER no_truncar_acciones BEFORE TRUNCATE ON acciones_documento EXECUTE FUNCTION impedir_truncado();

COMMIT;
