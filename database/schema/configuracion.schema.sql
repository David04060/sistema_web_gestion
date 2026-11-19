-- DOCUMENTACIÓN del catálogo instalado: NO es una migración ni debe ejecutarse.
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
-- Name: tipos_documentales validar_tipo_documental; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_tipo_documental BEFORE INSERT ON public.tipos_documentales FOR EACH ROW EXECUTE FUNCTION public.validar_tipo_documental();


--
-- Name: unidades_ubicacion validar_unidad_ubicacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_unidad_ubicacion BEFORE INSERT OR UPDATE ON public.unidades_ubicacion FOR EACH ROW EXECUTE FUNCTION public.validar_unidad_ubicacion();


--
-- Name: tipos_documentales z_registrar_oficina_tipo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_registrar_oficina_tipo AFTER INSERT ON public.tipos_documentales FOR EACH ROW EXECUTE FUNCTION public.registrar_oficina_tipo();


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
