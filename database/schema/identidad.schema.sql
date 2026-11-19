-- DOCUMENTACIÓN del catálogo instalado: NO es una migración ni debe ejecutarse.
--
-- Name: validar_miembro_ambito(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validar_miembro_ambito() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE r smallint; c text; t bigint;
BEGIN
  SELECT rol_id INTO r FROM usuarios WHERE id=NEW.usuario_id;
  SELECT clase,titular_id INTO c,t FROM ambitos_registro WHERE id=NEW.ambito_id;
  IF ((c='COMPARTIDO_DIRECCION' AND r IN (3,4)) OR
      (c='PERSONAL' AND r=5 AND t=NEW.usuario_id)) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Miembro incompatible con ámbito';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: validar_usuario_oficina(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validar_usuario_oficina() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE o text;
BEGIN
  IF NEW.oficina_id IS NOT NULL AND
     (TG_OP='INSERT' OR NEW.oficina_id IS DISTINCT FROM OLD.oficina_id) AND
     NOT EXISTS(SELECT 1 FROM public.oficinas WHERE id=NEW.oficina_id AND activa) THEN
    RAISE EXCEPTION 'Una oficina inactiva no admite nuevas asignaciones';
  END IF;
  IF NEW.rol_id=3 AND NEW.oficina_id IS NOT NULL THEN
    SELECT nombre INTO o FROM oficinas WHERE id=NEW.oficina_id;
    IF o IS DISTINCT FROM 'Dirección' THEN RAISE EXCEPTION 'Dirección requiere su oficina'; END IF;
  ELSIF NEW.rol_id=4 AND NEW.oficina_id IS NOT NULL THEN
    SELECT nombre INTO o FROM oficinas WHERE id=NEW.oficina_id;
    IF o IS DISTINCT FROM 'Mesa de Partes' THEN RAISE EXCEPTION 'Secretaría requiere Mesa de Partes'; END IF;
  ELSIF NEW.rol_id IN (1,2) AND NEW.oficina_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cuenta administrativa sin oficina documental';
  END IF;
  IF NEW.rol_id=5 AND EXISTS(SELECT 1 FROM oficinas WHERE id=NEW.oficina_id AND nombre IN('Dirección','Mesa de Partes')) THEN RAISE EXCEPTION 'Usuario no puede asignarse a Dirección ni Mesa de Partes'; END IF;
  NEW.actualizada_en:=clock_timestamp();
  RETURN NEW;
END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ambitos_registro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ambitos_registro (
    id bigint NOT NULL,
    clase text NOT NULL,
    titular_id bigint,
    creado_en timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT ambitos_registro_check CHECK (((clase = 'PERSONAL'::text) = (titular_id IS NOT NULL))),
    CONSTRAINT ambitos_registro_clase_check CHECK ((clase = ANY (ARRAY['COMPARTIDO_DIRECCION'::text, 'PERSONAL'::text])))
);


--
-- Name: ambitos_registro_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.ambitos_registro ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ambitos_registro_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: miembros_ambito; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.miembros_ambito (
    usuario_id bigint NOT NULL,
    ambito_id bigint NOT NULL
);


--
-- Name: oficinas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oficinas (
    id bigint NOT NULL,
    nombre text NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    creada_en timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT oficinas_nombre_check CHECK ((length(btrim(nombre)) > 0))
);


--
-- Name: oficinas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.oficinas ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.oficinas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id smallint NOT NULL,
    codigo text NOT NULL,
    nombre_visible text,
    CONSTRAINT roles_codigo_check CHECK ((codigo = ANY (ARRAY['SUPERADMINISTRADOR'::text, 'ADMINISTRADOR'::text, 'DIRECTOR'::text, 'SECRETARIA_DIRECCION'::text, 'USUARIO'::text]))),
    CONSTRAINT roles_nombre_visible_check CHECK (((nombre_visible IS NULL) OR ((char_length(btrim(nombre_visible)) >= 1) AND (char_length(btrim(nombre_visible)) <= 250))))
);


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id bigint NOT NULL,
    rol_id smallint NOT NULL,
    oficina_id bigint,
    nombre text NOT NULL,
    apellido text NOT NULL,
    nombre_usuario text NOT NULL,
    email text,
    telefono text,
    contrasena_hash text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    version_autenticacion integer DEFAULT 0 NOT NULL,
    creada_en timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    actualizada_en timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT usuarios_apellido_check CHECK ((length(btrim(apellido)) > 0)),
    CONSTRAINT usuarios_contrasena_hash_check CHECK ((length(btrim(contrasena_hash)) > 0)),
    CONSTRAINT usuarios_nombre_check CHECK ((length(btrim(nombre)) > 0)),
    CONSTRAINT usuarios_nombre_usuario_check CHECK ((length(btrim(nombre_usuario)) > 0)),
    CONSTRAINT usuarios_version_autenticacion_check CHECK ((version_autenticacion >= 0))
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.usuarios ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.usuarios_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ambitos_registro ambitos_registro_id_clase_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ambitos_registro
    ADD CONSTRAINT ambitos_registro_id_clase_key UNIQUE (id, clase);


--
-- Name: ambitos_registro ambitos_registro_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ambitos_registro
    ADD CONSTRAINT ambitos_registro_pkey PRIMARY KEY (id);


--
-- Name: ambitos_registro ambitos_registro_titular_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ambitos_registro
    ADD CONSTRAINT ambitos_registro_titular_id_key UNIQUE (titular_id);


--
-- Name: miembros_ambito miembros_ambito_ambito_id_usuario_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.miembros_ambito
    ADD CONSTRAINT miembros_ambito_ambito_id_usuario_id_key UNIQUE (ambito_id, usuario_id);


--
-- Name: miembros_ambito miembros_ambito_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.miembros_ambito
    ADD CONSTRAINT miembros_ambito_pkey PRIMARY KEY (usuario_id);


--
-- Name: oficinas oficinas_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oficinas
    ADD CONSTRAINT oficinas_nombre_key UNIQUE (nombre);


--
-- Name: oficinas oficinas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oficinas
    ADD CONSTRAINT oficinas_pkey PRIMARY KEY (id);


--
-- Name: roles roles_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_codigo_key UNIQUE (codigo);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_id_oficina_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_id_oficina_id_key UNIQUE (id, oficina_id);


--
-- Name: usuarios usuarios_nombre_usuario_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_nombre_usuario_key UNIQUE (nombre_usuario);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: usuarios_oficina_activa_unica; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuarios_oficina_activa_unica ON public.usuarios USING btree (oficina_id) WHERE (activo AND (oficina_id IS NOT NULL));


--
-- Name: usuarios sincronizar_periodo_oficina; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sincronizar_periodo_oficina AFTER INSERT OR UPDATE OF activo, oficina_id ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.sincronizar_periodo_oficina();


--
-- Name: miembros_ambito validar_miembro_ambito; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_miembro_ambito BEFORE INSERT OR UPDATE ON public.miembros_ambito FOR EACH ROW EXECUTE FUNCTION public.validar_miembro_ambito();


--
-- Name: usuarios validar_usuario_oficina; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_usuario_oficina BEFORE INSERT OR UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.validar_usuario_oficina();


--
-- Name: ambitos_registro ambitos_registro_titular_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ambitos_registro
    ADD CONSTRAINT ambitos_registro_titular_id_fkey FOREIGN KEY (titular_id) REFERENCES public.usuarios(id);


--
-- Name: miembros_ambito miembros_ambito_ambito_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.miembros_ambito
    ADD CONSTRAINT miembros_ambito_ambito_id_fkey FOREIGN KEY (ambito_id) REFERENCES public.ambitos_registro(id);


--
-- Name: miembros_ambito miembros_ambito_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.miembros_ambito
    ADD CONSTRAINT miembros_ambito_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: usuarios usuarios_oficina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_oficina_id_fkey FOREIGN KEY (oficina_id) REFERENCES public.oficinas(id);


--
-- Name: usuarios usuarios_rol_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_rol_id_fkey FOREIGN KEY (rol_id) REFERENCES public.roles(id);


--
-- PostgreSQL database dump complete
--

\unrestrict uWGQH7LHLDj48aLvvpEHnjXD4hZjcIzdCkj2LO0Jtuqt6dx3AOQMEHZ3RMw69SL
