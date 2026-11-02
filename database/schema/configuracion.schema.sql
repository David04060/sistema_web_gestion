-- DOCUMENTACIÓN del catálogo instalado: NO es una migración ni debe ejecutarse.
--
-- Name: registrar_cambio_nombre_campo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_cambio_nombre_campo() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE actor bigint; rol smallint; motivo text;
BEGIN
  IF (NEW.id,NEW.usuario_id,NEW.creado_por,NEW.creado_en) IS DISTINCT FROM
     (OLD.id,OLD.usuario_id,OLD.creado_por,OLD.creado_en) THEN
    RAISE EXCEPTION 'Identidad del campo inmutable';
  END IF;
  IF NEW.nombre_actual IS NOT DISTINCT FROM OLD.nombre_actual THEN RETURN NEW; END IF;
  actor:=nullif(current_setting('app.actor_id',true),'')::bigint;
  motivo:=current_setting('app.motivo',true);
  SELECT rol_id INTO rol FROM usuarios WHERE id=actor AND activo;
  IF coalesce(rol NOT IN (1,2),true) OR length(btrim(coalesce(motivo,'')))=0 THEN
    RAISE EXCEPTION 'Cambio de campo requiere administrador y motivo';
  END IF;
  INSERT INTO cambios_nombre_campo(campo_id,nombre_anterior,nombre_nuevo,actor_id,motivo)
    VALUES (OLD.id,OLD.nombre_actual,NEW.nombre_actual,actor,motivo);
  INSERT INTO auditoria_configuracion(actor_id,entidad,entidad_id,accion,motivo,anterior,posterior)
    VALUES (actor,'CAMPO_OPCIONAL',OLD.id,'RENOMBRAR',motivo,
      jsonb_build_object('nombre',OLD.nombre_actual),jsonb_build_object('nombre',NEW.nombre_actual));
  RETURN NEW;
END $$;


--
-- Name: validar_tipo_documental(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validar_tipo_documental() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM miembros_ambito WHERE ambito_id=NEW.ambito_id
                 AND usuario_id=NEW.creado_por) THEN
    RAISE EXCEPTION 'Tipo creado fuera del ámbito';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: validar_unidad_ubicacion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validar_unidad_ubicacion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE ciclo boolean;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id,NEW.propietario_id,NEW.oficina_id) IS DISTINCT FROM
                        (OLD.id,OLD.propietario_id,OLD.oficina_id) THEN
    RAISE EXCEPTION 'La identidad y propiedad de una ubicación no cambian';
  END IF;
  IF NEW.padre_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM unidades_ubicacion
                   WHERE id=NEW.padre_id AND propietario_id=NEW.propietario_id AND activo) THEN
      RAISE EXCEPTION 'La ubicación contenedora debe existir, estar activa y pertenecer al mismo usuario';
    END IF;
    IF TG_OP='UPDATE' THEN
      SELECT EXISTS (
        WITH RECURSIVE ascendencia(id,padre_id,camino) AS (
          SELECT id,padre_id,ARRAY[id] FROM unidades_ubicacion WHERE id=NEW.padre_id
          UNION ALL
          SELECT u.id,u.padre_id,a.camino || u.id FROM unidades_ubicacion u
          JOIN ascendencia a ON u.id=a.padre_id WHERE NOT u.id=ANY(a.camino)
        ) SELECT 1 FROM ascendencia WHERE id=NEW.id
      ) INTO ciclo;
      IF ciclo THEN RAISE EXCEPTION 'Una ubicación no puede contenerse a sí misma'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: cambios_nombre_campo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cambios_nombre_campo (
    id bigint NOT NULL,
    campo_id bigint NOT NULL,
    nombre_anterior text NOT NULL,
    nombre_nuevo text NOT NULL,
    actor_id bigint NOT NULL,
    motivo text NOT NULL,
    fecha timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT cambios_nombre_campo_motivo_check CHECK ((length(btrim(motivo)) > 0))
);


--
-- Name: cambios_nombre_campo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cambios_nombre_campo ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cambios_nombre_campo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: campos_opcionales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campos_opcionales (
    id bigint NOT NULL,
    usuario_id bigint NOT NULL,
    nombre_actual text NOT NULL,
    creado_por bigint NOT NULL,
    creado_en timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT campos_opcionales_nombre_actual_check CHECK ((length(btrim(nombre_actual)) > 0))
);


--
-- Name: campos_opcionales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.campos_opcionales ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.campos_opcionales_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tipos_documentales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipos_documentales (
    id bigint NOT NULL,
    ambito_id bigint NOT NULL,
    nombre text NOT NULL,
    prefijo text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_por bigint NOT NULL,
    creado_en timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT tipos_documentales_nombre_check CHECK ((length(btrim(nombre)) > 0)),
    CONSTRAINT tipos_documentales_prefijo_check CHECK ((prefijo ~ '^[A-Z]{2,8}$'::text))
);


--
-- Name: tipos_documentales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tipos_documentales ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tipos_documentales_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: unidades_ubicacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unidades_ubicacion (
    id bigint NOT NULL,
    propietario_id bigint NOT NULL,
    oficina_id bigint NOT NULL,
    clase text NOT NULL,
    nombre text NOT NULL,
    padre_id bigint,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT unidades_ubicacion_check CHECK ((padre_id IS DISTINCT FROM id)),
    CONSTRAINT unidades_ubicacion_clase_check CHECK ((length(btrim(clase)) > 0)),
    CONSTRAINT unidades_ubicacion_nombre_check CHECK ((length(btrim(nombre)) > 0))
);


--
-- Name: unidades_ubicacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.unidades_ubicacion ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.unidades_ubicacion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cambios_nombre_campo cambios_nombre_campo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cambios_nombre_campo
    ADD CONSTRAINT cambios_nombre_campo_pkey PRIMARY KEY (id);


--
-- Name: campos_opcionales campos_opcionales_id_usuario_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campos_opcionales
    ADD CONSTRAINT campos_opcionales_id_usuario_id_key UNIQUE (id, usuario_id);


--
-- Name: campos_opcionales campos_opcionales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campos_opcionales
    ADD CONSTRAINT campos_opcionales_pkey PRIMARY KEY (id);


--
-- Name: campos_opcionales campos_opcionales_usuario_id_nombre_actual_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campos_opcionales
    ADD CONSTRAINT campos_opcionales_usuario_id_nombre_actual_key UNIQUE (usuario_id, nombre_actual);


--
-- Name: tipos_documentales tipos_documentales_ambito_id_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_documentales
    ADD CONSTRAINT tipos_documentales_ambito_id_nombre_key UNIQUE (ambito_id, nombre);


--
-- Name: tipos_documentales tipos_documentales_ambito_id_prefijo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_documentales
    ADD CONSTRAINT tipos_documentales_ambito_id_prefijo_key UNIQUE (ambito_id, prefijo);


--
-- Name: tipos_documentales tipos_documentales_id_ambito_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_documentales
    ADD CONSTRAINT tipos_documentales_id_ambito_id_key UNIQUE (id, ambito_id);


--
-- Name: tipos_documentales tipos_documentales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_documentales
    ADD CONSTRAINT tipos_documentales_pkey PRIMARY KEY (id);


--
-- Name: unidades_ubicacion unidades_ubicacion_id_propietario_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidades_ubicacion
    ADD CONSTRAINT unidades_ubicacion_id_propietario_id_key UNIQUE (id, propietario_id);


--
-- Name: unidades_ubicacion unidades_ubicacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidades_ubicacion
    ADD CONSTRAINT unidades_ubicacion_pkey PRIMARY KEY (id);


--
-- Name: campos_opcionales no_borrar_campo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_borrar_campo BEFORE DELETE ON public.campos_opcionales FOR EACH ROW EXECUTE FUNCTION public.impedir_cambio_historico();


--
-- Name: cambios_nombre_campo proteger_cambios_campo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER proteger_cambios_campo BEFORE DELETE OR UPDATE ON public.cambios_nombre_campo FOR EACH ROW EXECUTE FUNCTION public.impedir_cambio_historico();


--
-- Name: campos_opcionales registrar_cambio_nombre_campo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER registrar_cambio_nombre_campo BEFORE UPDATE ON public.campos_opcionales FOR EACH ROW EXECUTE FUNCTION public.registrar_cambio_nombre_campo();


--
-- Name: tipos_documentales validar_tipo_documental; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_tipo_documental BEFORE INSERT ON public.tipos_documentales FOR EACH ROW EXECUTE FUNCTION public.validar_tipo_documental();


--
-- Name: unidades_ubicacion validar_unidad_ubicacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_unidad_ubicacion BEFORE INSERT OR UPDATE ON public.unidades_ubicacion FOR EACH ROW EXECUTE FUNCTION public.validar_unidad_ubicacion();


--
-- Name: cambios_nombre_campo cambios_nombre_campo_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cambios_nombre_campo
    ADD CONSTRAINT cambios_nombre_campo_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.usuarios(id);


--
-- Name: cambios_nombre_campo cambios_nombre_campo_campo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cambios_nombre_campo
    ADD CONSTRAINT cambios_nombre_campo_campo_id_fkey FOREIGN KEY (campo_id) REFERENCES public.campos_opcionales(id);


--
-- Name: campos_opcionales campos_opcionales_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campos_opcionales
    ADD CONSTRAINT campos_opcionales_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id);


--
-- Name: campos_opcionales campos_opcionales_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campos_opcionales
    ADD CONSTRAINT campos_opcionales_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: tipos_documentales tipos_documentales_ambito_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_documentales
    ADD CONSTRAINT tipos_documentales_ambito_id_fkey FOREIGN KEY (ambito_id) REFERENCES public.ambitos_registro(id);


--
-- Name: tipos_documentales tipos_documentales_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_documentales
    ADD CONSTRAINT tipos_documentales_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id);


--
-- Name: unidades_ubicacion unidades_ubicacion_padre_id_propietario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidades_ubicacion
    ADD CONSTRAINT unidades_ubicacion_padre_id_propietario_id_fkey FOREIGN KEY (padre_id, propietario_id) REFERENCES public.unidades_ubicacion(id, propietario_id);


--
-- Name: unidades_ubicacion unidades_ubicacion_propietario_id_oficina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidades_ubicacion
    ADD CONSTRAINT unidades_ubicacion_propietario_id_oficina_id_fkey FOREIGN KEY (propietario_id, oficina_id) REFERENCES public.usuarios(id, oficina_id);


