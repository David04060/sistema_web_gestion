-- DOCUMENTACIÓN del catálogo instalado: NO es una migración ni debe ejecutarse.
--
-- Name: aplicar_delegacion(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Tras insertar la constancia, cierra ubicación vigente, cambia situación y registra auditoría dentro de la misma transacción.
CREATE FUNCTION public.aplicar_delegacion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE situacion_anterior text; ruta_anterior text; oficina_anterior text;
BEGIN
  SELECT situacion INTO situacion_anterior FROM documentos WHERE id=NEW.documento_id;
  UPDATE ubicaciones_documento SET vigente=false
    WHERE documento_id=NEW.documento_id AND vigente
    RETURNING ruta_ubicacion_guardada,oficina_nombre_guardado INTO ruta_anterior,oficina_anterior;
  UPDATE documentos SET situacion='DELEGADO' WHERE id=NEW.documento_id;
  INSERT INTO auditoria_documental(documento_id,actor_id,accion,anterior,posterior)
    VALUES (NEW.documento_id,NEW.delegado_por,'DELEGACION',
      jsonb_build_object('situacion',situacion_anterior,'ruta',ruta_anterior,'oficina',oficina_anterior),
      jsonb_build_object('situacion','DELEGADO','ruta',NULL,'persona',NEW.nombre_persona_guardado,
        'oficina_id',NEW.oficina_indicada_id,'observaciones',NEW.observaciones));
  RETURN NULL;
END $$;


--
-- Name: aplicar_ubicacion(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Tras ubicar, actualiza la situación documental y registra la ruta histórica; no transfiere autoría.
CREATE FUNCTION public.aplicar_ubicacion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (SELECT situacion FROM documentos WHERE id=NEW.documento_id)='PENDIENTE_DIRECCION' THEN
    UPDATE documentos SET situacion='GUARDADO_DIRECCION' WHERE id=NEW.documento_id;
  END IF;
  INSERT INTO auditoria_documental(documento_id,actor_id,accion,posterior)
    VALUES (NEW.documento_id,NEW.registrado_por,'UBICACION',
      jsonb_build_object('unidad_id',NEW.unidad_id,
                         'ruta',NEW.ruta_ubicacion_guardada));
  RETURN NULL;
END $$;


--
-- Name: asignar_codigo_documental(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Antes del alta, valida tipo y ámbito y reserva correlativo por año bajo bloqueo; devuelve NEW con código visible.
CREATE FUNCTION public.asignar_codigo_documental() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE p text; tn text; rol smallint; amb text; n bigint;
BEGIN
  SELECT prefijo,nombre INTO p,tn FROM tipos_documentales
    WHERE id=NEW.tipo_id AND ambito_id=NEW.ambito_id AND activo FOR SHARE;
  IF p IS NULL THEN RAISE EXCEPTION 'Tipo documental no disponible'; END IF;
  SELECT rol_id INTO rol FROM usuarios WHERE id=NEW.registrado_por;
  SELECT clase INTO amb FROM ambitos_registro WHERE id=NEW.ambito_id;
  IF ((rol=5 AND amb='PERSONAL' AND NEW.situacion='PERSONAL') OR
      (rol=3 AND amb='COMPARTIDO_DIRECCION' AND NEW.situacion='PENDIENTE_DIRECCION') OR
      (rol=4 AND amb='COMPARTIDO_DIRECCION' AND NEW.situacion IN
        ('PENDIENTE_DIRECCION','EN_MESA_DE_PARTES'))) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Situación inicial incompatible';
  END IF;
  NEW.anio:=extract(year from clock_timestamp())::integer;
  INSERT INTO correlativos_documentales(ambito_id,tipo_id,anio,ultimo_numero)
    VALUES (NEW.ambito_id,NEW.tipo_id,NEW.anio,1)
    ON CONFLICT (ambito_id,tipo_id,anio) DO UPDATE
      SET ultimo_numero=correlativos_documentales.ultimo_numero+1
    RETURNING ultimo_numero INTO n;
  NEW.correlativo:=n;
  NEW.prefijo_guardado:=p;
  NEW.tipo_nombre_guardado:=tn;
  NEW.codigo_visible:=p||NEW.anio::text||
    CASE WHEN n>=1000 THEN n::text ELSE lpad(n::text,3,'0') END;
  RETURN NEW;
END $$;


--
-- Name: auditar_documento(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Registra alta o cambios de contenido/situación con actor y motivo de la transacción, preservando antes y después.
CREATE FUNCTION public.auditar_documento() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE actor bigint; accion text; motivo text;
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO auditoria_documental(documento_id,actor_id,accion,posterior)
      VALUES (NEW.id,NEW.registrado_por,'REGISTRO',to_jsonb(NEW));
  ELSE
    actor := nullif(current_setting('app.actor_id',true),'')::bigint;
    motivo := current_setting('app.motivo',true);
    IF NEW.situacion='ANULADO' AND OLD.situacion<>'ANULADO' THEN
      accion:='ANULACION';
    ELSIF (NEW.asunto,NEW.remitente,NEW.observaciones) IS DISTINCT FROM
          (OLD.asunto,OLD.remitente,OLD.observaciones) THEN
      accion:='CORRECCION';
    ELSE RETURN NULL;
    END IF;
    INSERT INTO auditoria_documental(documento_id,actor_id,accion,motivo,anterior,posterior)
      VALUES (NEW.id,actor,accion,motivo,to_jsonb(OLD),to_jsonb(NEW));
  END IF;
  RETURN NULL;
END $$;


--
-- Name: documentos_grupo(bigint); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Recorre relaciones en ambos sentidos desde un documento y devuelve IDs del grupo. El llamador filtra cada ID por actor.
CREATE FUNCTION public.documentos_grupo(doc bigint) RETURNS TABLE(id bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 WITH RECURSIVE grupo(id) AS (
  SELECT doc
  UNION
  SELECT CASE WHEN r.documento_id=g.id THEN r.origen_id ELSE r.documento_id END
  FROM grupo g JOIN public.documentos_relaciones r ON r.documento_id=g.id OR r.origen_id=g.id
 ) SELECT id FROM grupo
$$;


--
-- Name: validar_delegacion(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Antes de insertar, verifica actor, situación y destino compatible. No permite delegaciones sucesivas ni cambio de ámbito.
CREATE FUNCTION public.validar_delegacion ()
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


--
-- Name: validar_documento_actualizacion(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Protege identidad y clasificación; exige permiso, motivo y transición válida y actualiza revisión/fecha.
CREATE FUNCTION public.validar_documento_actualizacion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE actor bigint; rol smallint; motivo text; cambio_contenido boolean;
BEGIN
  IF (NEW.id,NEW.ambito_id,NEW.tipo_id,NEW.registrado_por,NEW.anio,
      NEW.correlativo,NEW.codigo_visible,NEW.prefijo_guardado,NEW.tipo_nombre_guardado,NEW.clasificacion)
     IS DISTINCT FROM
     (OLD.id,OLD.ambito_id,OLD.tipo_id,OLD.registrado_por,OLD.anio,
      OLD.correlativo,OLD.codigo_visible,OLD.prefijo_guardado,OLD.tipo_nombre_guardado,OLD.clasificacion) THEN
    RAISE EXCEPTION 'Identidad, autoría, clasificación y código inmutables';
  END IF;
  IF NEW.situacion IS DISTINCT FROM OLD.situacion AND NOT (
      (OLD.situacion='PENDIENTE_DIRECCION' AND NEW.situacion IN ('GUARDADO_DIRECCION','DELEGADO','ANULADO')) OR
      (OLD.situacion='EN_MESA_DE_PARTES' AND NEW.situacion IN ('DELEGADO','ANULADO')) OR
      (OLD.situacion='DELEGADO' AND NEW.situacion='ANULADO' AND EXISTS (
        SELECT 1 FROM delegaciones_documento e WHERE e.documento_id=OLD.id AND e.usuario_indicado_id IS NOT NULL)) OR
      (OLD.situacion='PERSONAL' AND NEW.situacion IN ('DELEGADO','ANULADO')) OR (OLD.situacion='GUARDADO_DIRECCION' AND
      (NEW.situacion='ANULADO' OR (NEW.situacion='DELEGADO' AND EXISTS (
        SELECT 1 FROM delegaciones_documento e WHERE e.documento_id=NEW.id))))) THEN
    RAISE EXCEPTION 'Transición documental inválida';
  END IF;
  IF OLD.situacion='ANULADO' THEN RAISE EXCEPTION 'Registro anulado inmutable'; END IF;
  cambio_contenido := (NEW.asunto,NEW.remitente,NEW.observaciones) IS DISTINCT FROM
                      (OLD.asunto,OLD.remitente,OLD.observaciones);
  IF cambio_contenido OR NEW.situacion='ANULADO' THEN
    actor := nullif(current_setting('app.actor_id',true),'')::bigint;
    motivo := current_setting('app.motivo',true);
    SELECT rol_id INTO rol FROM usuarios WHERE id=actor AND activo;
    IF actor IS NULL OR length(btrim(coalesce(motivo,'')))=0 THEN
      RAISE EXCEPTION 'Actor y motivo obligatorios';
    END IF;
    IF cambio_contenido AND
       (actor<>OLD.registrado_por OR (rol=5 AND OLD.situacion='DELEGADO')) THEN
      RAISE EXCEPTION 'Corrección no autorizada';
    END IF;
    IF NEW.situacion='ANULADO' AND NOT
       (actor=OLD.registrado_por OR
        (OLD.situacion='PENDIENTE_DIRECCION' AND rol=3 AND
         (SELECT clase FROM ambitos_registro WHERE id=OLD.ambito_id)='COMPARTIDO_DIRECCION')) THEN
      RAISE EXCEPTION 'Anulación no autorizada';
    END IF;
  END IF;
  IF NEW.situacion='ANULADO' THEN
    IF NEW.situacion_antes_anulacion IS DISTINCT FROM OLD.situacion THEN
      RAISE EXCEPTION 'Debe conservarse situación anterior'; END IF;
  ELSIF NEW.situacion_antes_anulacion IS NOT NULL THEN
    RAISE EXCEPTION 'Situación anterior solo corresponde a anulación';
  END IF;
  NEW.revision:=OLD.revision+1;
  NEW.actualizado_en:=clock_timestamp();
  RETURN NEW;
END $$;


--
-- Name: validar_estado_final(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Trigger diferido: comprueba al confirmar que situación y hechos de delegación/ubicación sean coherentes.
CREATE FUNCTION public.validar_estado_final ()
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


--
-- Name: validar_relacion(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Valida origen y nuevo documento, acceso y ausencia de autorreferencias/ciclos antes de crear la relación.
CREATE FUNCTION public.validar_relacion ()
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


--
-- Name: validar_ubicacion(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Verifica propietario, oficina, estado y jerarquía elegibles antes de registrar una ubicación histórica.
CREATE FUNCTION public.validar_ubicacion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE d documentos%ROWTYPE; propietario bigint; rol smallint;
        onombre text; ruta text;
BEGIN
  SELECT * INTO d FROM documentos WHERE id=NEW.documento_id FOR UPDATE;
  SELECT u.propietario_id,o.nombre INTO propietario,onombre
    FROM unidades_ubicacion u JOIN oficinas o ON o.id=u.oficina_id
    WHERE u.id=NEW.unidad_id AND u.activo;
  SELECT rol_id INTO rol FROM usuarios WHERE id=NEW.registrado_por AND activo;
  IF propietario IS NULL OR propietario<>NEW.registrado_por OR d.situacion IN ('ANULADO','DELEGADO') THEN
    RAISE EXCEPTION 'Ubicación no permitida';
  END IF;
  IF ((d.situacion='PERSONAL' AND rol=5 AND d.registrado_por=NEW.registrado_por) OR
      (d.situacion='EN_MESA_DE_PARTES' AND rol=4 AND d.registrado_por=NEW.registrado_por) OR
      (d.situacion='PENDIENTE_DIRECCION' AND rol=3)) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Actor sin permiso de ubicación';
  END IF;
  NEW.oficina_nombre_guardado:=onombre;
  WITH RECURSIVE cadena(id,padre_id,clase,nombre,profundidad,camino) AS (
    SELECT id,padre_id,clase,nombre,0,ARRAY[id]
      FROM unidades_ubicacion WHERE id=NEW.unidad_id
    UNION ALL
    SELECT u.id,u.padre_id,u.clase,u.nombre,c.profundidad+1,c.camino||u.id
      FROM unidades_ubicacion u JOIN cadena c ON u.id=c.padre_id
      WHERE NOT u.id=ANY(c.camino)
  ) SELECT string_agg(CASE WHEN padre_id IS NULL AND clase<>'Lugar' THEN clase||': '||nombre ELSE nombre END,' / ' ORDER BY profundidad DESC)
      INTO ruta FROM cadena;
  NEW.ruta_ubicacion_guardada:=ruta;
  RETURN NEW;
END $$;


--
-- Name: correlativos_documentales; Type: TABLE; Schema: public; Owner: -
--

-- Modelo: Contadores transaccionales por ámbito, tipo y año.
CREATE TABLE public.correlativos_documentales (
    ambito_id bigint NOT NULL,
    tipo_id bigint NOT NULL,
    anio integer NOT NULL,
    ultimo_numero bigint NOT NULL,
    CONSTRAINT correlativos_documentales_anio_check CHECK (((anio >= 2000) AND (anio <= 9999))),
    CONSTRAINT correlativos_documentales_ultimo_numero_check CHECK ((ultimo_numero > 0))
);


--
-- Name: delegaciones_documento; Type: TABLE; Schema: public; Owner: -
--

-- Modelo: Constancia única de destino por documento; no modifica autor ni ámbito.
CREATE TABLE public.delegaciones_documento (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    documento_id bigint NOT NULL,
    oficina_indicada_id bigint,
    usuario_indicado_id bigint,
    nombre_persona_guardado text NOT NULL,
    observaciones text,
    delegado_por bigint NOT NULL,
    delegado_en timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT delegaciones_documento_check CHECK (((oficina_indicada_id IS NULL) OR (usuario_indicado_id IS NOT NULL))),
    CONSTRAINT delegaciones_documento_nombre_persona_guardado_check CHECK ((length(btrim(nombre_persona_guardado)) > 0))
);


--
-- Name: documentos; Type: TABLE; Schema: public; Owner: -
--

-- Modelo: Registro central con clasificación, situación, autor y revisión de concurrencia.
CREATE TABLE public.documentos (
    id bigint NOT NULL,
    ambito_id bigint NOT NULL,
    tipo_id bigint NOT NULL,
    tipo_nombre_guardado text NOT NULL,
    registrado_por bigint NOT NULL,
    clasificacion text NOT NULL,
    asunto text NOT NULL,
    remitente text,
    observaciones text,
    anio integer NOT NULL,
    correlativo bigint NOT NULL,
    prefijo_guardado text NOT NULL,
    codigo_visible text NOT NULL,
    situacion text NOT NULL,
    situacion_antes_anulacion text,
    creado_en timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    CONSTRAINT documentos_asunto_check CHECK ((length(btrim(asunto)) > 0)),
    CONSTRAINT documentos_check CHECK (((situacion = 'ANULADO'::text) = (situacion_antes_anulacion IS NOT NULL))),
    CONSTRAINT documentos_clasificacion_check CHECK ((clasificacion = ANY (ARRAY['RECIBIDO'::text, 'EMITIDO'::text]))),
    CONSTRAINT documentos_correlativo_check CHECK ((correlativo > 0)),
    CONSTRAINT documentos_revision_check CHECK ((revision > 0)),
    CONSTRAINT documentos_situacion_check CHECK ((situacion = ANY (ARRAY['PENDIENTE_DIRECCION'::text, 'EN_MESA_DE_PARTES'::text, 'GUARDADO_DIRECCION'::text, 'PERSONAL'::text, 'DELEGADO'::text, 'ANULADO'::text])))
);


--
-- Name: documentos_anulados; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.documentos_anulados AS
 SELECT id,
    ambito_id,
    tipo_id,
    tipo_nombre_guardado,
    registrado_por,
    clasificacion,
    asunto,
    remitente,
    observaciones,
    anio,
    correlativo,
    prefijo_guardado,
    codigo_visible,
    situacion,
    situacion_antes_anulacion,
    creado_en,
    actualizado_en,
    revision
   FROM public.documentos
  WHERE (situacion = 'ANULADO'::text);


--
-- Name: documentos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.documentos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.documentos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: documentos_oficina; Type: TABLE; Schema: public; Owner: -
--

-- Modelo: Relación entre documento y periodo institucional de su alta.
CREATE TABLE public.documentos_oficina (
    documento_id bigint NOT NULL,
    periodo_id bigint NOT NULL
);


--
-- Name: documentos_ordinarios; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.documentos_ordinarios AS
 SELECT id,
    ambito_id,
    tipo_id,
    tipo_nombre_guardado,
    registrado_por,
    clasificacion,
    asunto,
    remitente,
    observaciones,
    anio,
    correlativo,
    prefijo_guardado,
    codigo_visible,
    situacion,
    situacion_antes_anulacion,
    creado_en,
    actualizado_en,
    revision
   FROM public.documentos
  WHERE (situacion <> 'ANULADO'::text);


--
-- Name: documentos_relaciones; Type: TABLE; Schema: public; Owner: -
--

-- Modelo: Vínculo del documento nuevo con su origen; base del recorrido de grupos.
CREATE TABLE public.documentos_relaciones (
    documento_id bigint NOT NULL,
    origen_id bigint NOT NULL,
    creado_por bigint NOT NULL,
    creado_en timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT documentos_relaciones_check CHECK ((documento_id <> origen_id))
);


--
-- Name: ubicaciones_documento; Type: TABLE; Schema: public; Owner: -
--

-- Modelo: Ubicación física con ruta guardada, actor y vigencia histórica.
CREATE TABLE public.ubicaciones_documento (
    id bigint NOT NULL,
    documento_id bigint NOT NULL,
    unidad_id bigint NOT NULL,
    oficina_nombre_guardado text NOT NULL,
    ruta_ubicacion_guardada text NOT NULL,
    registrado_por bigint NOT NULL,
    registrado_en timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    vigente boolean DEFAULT true NOT NULL
);


--
-- Name: ubicaciones_documento_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.ubicaciones_documento ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ubicaciones_documento_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: correlativos_documentales correlativos_documentales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.correlativos_documentales
    ADD CONSTRAINT correlativos_documentales_pkey PRIMARY KEY (ambito_id, tipo_id, anio);


--
-- Name: delegaciones_documento delegaciones_documento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegaciones_documento
    ADD CONSTRAINT delegaciones_documento_pkey PRIMARY KEY (id);


--
-- Name: documentos documentos_ambito_id_codigo_visible_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos
    ADD CONSTRAINT documentos_ambito_id_codigo_visible_key UNIQUE (ambito_id, codigo_visible);


--
-- Name: documentos documentos_ambito_id_tipo_id_anio_correlativo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos
    ADD CONSTRAINT documentos_ambito_id_tipo_id_anio_correlativo_key UNIQUE (ambito_id, tipo_id, anio, correlativo);


--
-- Name: documentos_oficina documentos_oficina_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_oficina
    ADD CONSTRAINT documentos_oficina_pkey PRIMARY KEY (documento_id);


--
-- Name: documentos documentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos
    ADD CONSTRAINT documentos_pkey PRIMARY KEY (id);


--
-- Name: documentos_relaciones documentos_relaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_relaciones
    ADD CONSTRAINT documentos_relaciones_pkey PRIMARY KEY (documento_id);


--
-- Name: ubicaciones_documento ubicaciones_documento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ubicaciones_documento
    ADD CONSTRAINT ubicaciones_documento_pkey PRIMARY KEY (id);


--
-- Name: documentos_oficina_periodo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documentos_oficina_periodo ON public.documentos_oficina USING btree (periodo_id);


--
-- Name: documentos_relaciones_origen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documentos_relaciones_origen ON public.documentos_relaciones USING btree (origen_id);


--
-- Name: documentos a_exigir_oficina_autor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_exigir_oficina_autor BEFORE INSERT ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.exigir_oficina_autor();


--
-- Name: delegaciones_documento a_proteger_historico; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_proteger_historico BEFORE INSERT OR DELETE OR UPDATE ON public.delegaciones_documento FOR EACH ROW EXECUTE FUNCTION public.proteger_documento_historico();


--
-- Name: documentos a_proteger_historico; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_proteger_historico BEFORE UPDATE ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.proteger_documento_historico();


--
-- Name: ubicaciones_documento a_proteger_historico; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_proteger_historico BEFORE INSERT OR DELETE OR UPDATE ON public.ubicaciones_documento FOR EACH ROW EXECUTE FUNCTION public.proteger_documento_historico();


--
-- Name: delegaciones_documento aplicar_delegacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aplicar_delegacion AFTER INSERT ON public.delegaciones_documento FOR EACH ROW EXECUTE FUNCTION public.aplicar_delegacion();


--
-- Name: ubicaciones_documento aplicar_ubicacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aplicar_ubicacion AFTER INSERT ON public.ubicaciones_documento FOR EACH ROW EXECUTE FUNCTION public.aplicar_ubicacion();


--
-- Name: documentos asignar_codigo_documental; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER asignar_codigo_documental BEFORE INSERT ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.asignar_codigo_documental();


--
-- Name: documentos auditar_documento; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auditar_documento AFTER INSERT OR UPDATE ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.auditar_documento();


--
-- Name: documentos documento_estado_con_hecho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER documento_estado_con_hecho AFTER INSERT OR UPDATE ON public.documentos DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validar_estado_final();


--
-- Name: documentos no_borrar_documento; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_borrar_documento BEFORE DELETE ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.impedir_borrado_documento();


--
-- Name: ubicaciones_documento no_borrar_ubicacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_borrar_ubicacion BEFORE DELETE ON public.ubicaciones_documento FOR EACH ROW EXECUTE FUNCTION public.impedir_cambio_historico();


--
-- Name: delegaciones_documento no_truncar_delegaciones; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_truncar_delegaciones BEFORE TRUNCATE ON public.delegaciones_documento FOR EACH STATEMENT EXECUTE FUNCTION public.impedir_truncado();


--
-- Name: documentos no_truncar_documentos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_truncar_documentos BEFORE TRUNCATE ON public.documentos FOR EACH STATEMENT EXECUTE FUNCTION public.impedir_truncado();


--
-- Name: documentos_relaciones no_truncar_relaciones; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_truncar_relaciones BEFORE TRUNCATE ON public.documentos_relaciones FOR EACH STATEMENT EXECUTE FUNCTION public.impedir_truncado();


--
-- Name: ubicaciones_documento no_truncar_ubicaciones; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_truncar_ubicaciones BEFORE TRUNCATE ON public.ubicaciones_documento FOR EACH STATEMENT EXECUTE FUNCTION public.impedir_truncado();


--
-- Name: documentos proteger_anulacion_decidida_por_direccion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER proteger_anulacion_decidida_por_direccion BEFORE UPDATE OF situacion ON public.documentos FOR EACH ROW WHEN (((old.situacion IS DISTINCT FROM new.situacion) AND (new.situacion = 'ANULADO'::text))) EXECUTE FUNCTION public.proteger_anulacion_decidida_por_direccion();


--
-- Name: delegaciones_documento proteger_delegaciones; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER proteger_delegaciones BEFORE DELETE OR UPDATE ON public.delegaciones_documento FOR EACH ROW EXECUTE FUNCTION public.impedir_cambio_historico();


--
-- Name: documentos_relaciones proteger_relaciones; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER proteger_relaciones BEFORE DELETE OR UPDATE ON public.documentos_relaciones FOR EACH ROW EXECUTE FUNCTION public.impedir_cambio_historico();


--
-- Name: delegaciones_documento validar_delegacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_delegacion BEFORE INSERT ON public.delegaciones_documento FOR EACH ROW EXECUTE FUNCTION public.validar_delegacion();


--
-- Name: documentos validar_documento_actualizacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_documento_actualizacion BEFORE UPDATE ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.validar_documento_actualizacion();


--
-- Name: documentos_relaciones validar_relacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_relacion BEFORE INSERT ON public.documentos_relaciones FOR EACH ROW EXECUTE FUNCTION public.validar_relacion();


--
-- Name: ubicaciones_documento validar_ubicacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_ubicacion BEFORE INSERT ON public.ubicaciones_documento FOR EACH ROW EXECUTE FUNCTION public.validar_ubicacion();


--
-- Name: documentos z_programar_retencion_pdf; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_programar_retencion_pdf AFTER UPDATE OF situacion ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.programar_retencion_pdf_anulado();


--
-- Name: documentos z_registrar_oficina_documento; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_registrar_oficina_documento AFTER INSERT ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.registrar_oficina_documento();


--
-- Name: correlativos_documentales correlativos_documentales_tipo_id_ambito_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.correlativos_documentales
    ADD CONSTRAINT correlativos_documentales_tipo_id_ambito_id_fkey FOREIGN KEY (tipo_id, ambito_id) REFERENCES public.tipos_documentales(id, ambito_id);


--
-- Name: delegaciones_documento delegaciones_documento_delegado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegaciones_documento
    ADD CONSTRAINT delegaciones_documento_delegado_por_fkey FOREIGN KEY (delegado_por) REFERENCES public.usuarios(id);


--
-- Name: delegaciones_documento delegaciones_documento_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegaciones_documento
    ADD CONSTRAINT delegaciones_documento_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos(id);


--
-- Name: delegaciones_documento delegaciones_documento_oficina_indicada_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegaciones_documento
    ADD CONSTRAINT delegaciones_documento_oficina_indicada_id_fkey FOREIGN KEY (oficina_indicada_id) REFERENCES public.oficinas(id);


--
-- Name: delegaciones_documento delegaciones_documento_usuario_indicado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegaciones_documento
    ADD CONSTRAINT delegaciones_documento_usuario_indicado_id_fkey FOREIGN KEY (usuario_indicado_id) REFERENCES public.usuarios(id);


--
-- Name: delegaciones_documento delegaciones_documento_usuario_indicado_id_oficina_indicad_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegaciones_documento
    ADD CONSTRAINT delegaciones_documento_usuario_indicado_id_oficina_indicad_fkey FOREIGN KEY (usuario_indicado_id, oficina_indicada_id) REFERENCES public.usuarios(id, oficina_id);


--
-- Name: documentos documentos_ambito_id_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos
    ADD CONSTRAINT documentos_ambito_id_registrado_por_fkey FOREIGN KEY (ambito_id, registrado_por) REFERENCES public.miembros_ambito(ambito_id, usuario_id);


--
-- Name: documentos_oficina documentos_oficina_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_oficina
    ADD CONSTRAINT documentos_oficina_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos(id);


--
-- Name: documentos_oficina documentos_oficina_periodo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_oficina
    ADD CONSTRAINT documentos_oficina_periodo_id_fkey FOREIGN KEY (periodo_id) REFERENCES public.oficina_periodos(id);


--
-- Name: documentos_relaciones documentos_relaciones_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_relaciones
    ADD CONSTRAINT documentos_relaciones_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id);


--
-- Name: documentos_relaciones documentos_relaciones_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_relaciones
    ADD CONSTRAINT documentos_relaciones_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos(id);


--
-- Name: documentos_relaciones documentos_relaciones_origen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_relaciones
    ADD CONSTRAINT documentos_relaciones_origen_id_fkey FOREIGN KEY (origen_id) REFERENCES public.documentos(id);


--
-- Name: documentos documentos_tipo_id_ambito_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos
    ADD CONSTRAINT documentos_tipo_id_ambito_id_fkey FOREIGN KEY (tipo_id, ambito_id) REFERENCES public.tipos_documentales(id, ambito_id);


--
-- Name: ubicaciones_documento ubicaciones_documento_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ubicaciones_documento
    ADD CONSTRAINT ubicaciones_documento_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos(id);


--
-- Name: ubicaciones_documento ubicaciones_documento_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ubicaciones_documento
    ADD CONSTRAINT ubicaciones_documento_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuarios(id);


--
-- Name: ubicaciones_documento ubicaciones_documento_unidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ubicaciones_documento
    ADD CONSTRAINT ubicaciones_documento_unidad_id_fkey FOREIGN KEY (unidad_id) REFERENCES public.unidades_ubicacion(id);
