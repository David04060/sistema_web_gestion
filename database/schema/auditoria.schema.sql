-- DOCUMENTACIÓN del catálogo instalado: NO es una migración ni debe ejecutarse.
--
-- Name: auditoria_configuracion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auditoria_configuracion (
    id bigint NOT NULL,
    actor_id bigint NOT NULL,
    entidad text NOT NULL,
    entidad_id bigint NOT NULL,
    accion text NOT NULL,
    motivo text,
    anterior jsonb,
    posterior jsonb,
    fecha timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


--
-- Name: auditoria_configuracion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.auditoria_configuracion ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.auditoria_configuracion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auditoria_documental; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auditoria_documental (
    id bigint NOT NULL,
    documento_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    accion text NOT NULL,
    motivo text,
    anterior jsonb,
    posterior jsonb,
    fecha timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT auditoria_documental_check CHECK (((accion <> ALL (ARRAY['CORRECCION'::text, 'ANULACION'::text])) OR (length(btrim(COALESCE(motivo, ''::text))) > 0)))
);


--
-- Name: auditoria_documental_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.auditoria_documental ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.auditoria_documental_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auditoria_configuracion auditoria_configuracion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_configuracion
    ADD CONSTRAINT auditoria_configuracion_pkey PRIMARY KEY (id);


--
-- Name: auditoria_documental auditoria_documental_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_documental
    ADD CONSTRAINT auditoria_documental_pkey PRIMARY KEY (id);


--
-- Name: auditoria_documental no_truncar_auditoria; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_truncar_auditoria BEFORE TRUNCATE ON public.auditoria_documental FOR EACH STATEMENT EXECUTE FUNCTION public.impedir_truncado();


--
-- Name: auditoria_configuracion no_truncar_configuracion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_truncar_configuracion BEFORE TRUNCATE ON public.auditoria_configuracion FOR EACH STATEMENT EXECUTE FUNCTION public.impedir_truncado();


--
-- Name: auditoria_configuracion proteger_auditoria_configuracion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER proteger_auditoria_configuracion BEFORE DELETE OR UPDATE ON public.auditoria_configuracion FOR EACH ROW EXECUTE FUNCTION public.impedir_cambio_historico();


--
-- Name: auditoria_documental proteger_auditoria_documental; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER proteger_auditoria_documental BEFORE DELETE OR UPDATE ON public.auditoria_documental FOR EACH ROW EXECUTE FUNCTION public.impedir_cambio_historico();


--
-- Name: auditoria_configuracion auditoria_configuracion_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_configuracion
    ADD CONSTRAINT auditoria_configuracion_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.usuarios(id);


--
-- Name: auditoria_documental auditoria_documental_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_documental
    ADD CONSTRAINT auditoria_documental_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.usuarios(id);


--
-- Name: auditoria_documental auditoria_documental_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_documental
    ADD CONSTRAINT auditoria_documental_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos(id);


