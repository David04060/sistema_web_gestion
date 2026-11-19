-- DOCUMENTACIÓN del catálogo instalado: NO es una migración ni debe ejecutarse.
--
-- Name: auditar_pdf(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auditar_pdf() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE actor bigint; accion text; doc bigint;
BEGIN
  IF TG_OP='DELETE' THEN
    IF public.es_finalizacion_retencion(OLD.documento_id,OLD.revision,OLD.clave_r2) THEN RETURN NULL; END IF;
  END IF;
  actor:=nullif(current_setting('app.actor_id',true),'')::bigint;
  doc:=CASE WHEN TG_OP='DELETE' THEN OLD.documento_id ELSE NEW.documento_id END;
  accion:=CASE TG_OP WHEN 'INSERT' THEN 'CARGA' WHEN 'UPDATE' THEN 'REEMPLAZO' ELSE 'ELIMINACION' END;
  IF TG_OP IN ('UPDATE','DELETE') THEN
    INSERT INTO pdf_objetos_pendientes(clave_r2,documento_id,limpiar_desde)
      VALUES (OLD.clave_r2,doc,clock_timestamp()) ON CONFLICT(clave_r2) DO UPDATE SET limpiar_desde=least(pdf_objetos_pendientes.limpiar_desde,EXCLUDED.limpiar_desde),eliminado_en=NULL;
  END IF;
  INSERT INTO pdf_eventos(documento_id,actor_id,accion,revision)
    VALUES (doc,actor,accion,CASE WHEN TG_OP='DELETE' THEN OLD.revision ELSE NEW.revision END);
  INSERT INTO auditoria_documental(documento_id,actor_id,accion,anterior,posterior)
    VALUES (doc,actor,'PDF_'||accion,
      CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD)-'clave_r2' END,
      CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW)-'clave_r2' END);
  RETURN NULL;
END $$;


--
-- Name: validar_pdf_permiso(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validar_pdf_permiso() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE doc bigint; actor bigint; rol smallint; d documentos%ROWTYPE; amb text;
BEGIN
  IF TG_OP='DELETE' THEN
    IF public.es_finalizacion_retencion(OLD.documento_id,OLD.revision,OLD.clave_r2) THEN RETURN OLD; END IF;
  END IF;
  doc:=CASE WHEN TG_OP='DELETE' THEN OLD.documento_id ELSE NEW.documento_id END;
  actor:=nullif(current_setting('app.actor_id',true),'')::bigint;
  SELECT rol_id INTO rol FROM usuarios WHERE id=actor AND activo;
  SELECT * INTO d FROM documentos WHERE id=doc FOR UPDATE;
  SELECT clase INTO amb FROM ambitos_registro WHERE id=d.ambito_id;
  IF d.id IS NULL OR d.situacion='ANULADO' OR
     ((amb='COMPARTIDO_DIRECCION' AND rol IN (3,4)) OR
      (actor=d.registrado_por AND rol IN (3,4,5) AND TG_OP<>'DELETE') OR
      (amb='PERSONAL' AND rol=5 AND actor=d.registrado_por AND d.situacion<>'DELEGADO'))
       IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Operación PDF no autorizada';
  END IF;
  IF TG_OP<>'DELETE' AND NEW.actualizado_por IS DISTINCT FROM actor THEN
    RAISE EXCEPTION 'Actor PDF incompatible';
  END IF;
  IF TG_OP='UPDATE' AND NEW.documento_id<>OLD.documento_id THEN
    RAISE EXCEPTION 'Documento PDF inmutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;


--
-- Name: documentos_pdf; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentos_pdf (
    documento_id bigint NOT NULL,
    revision uuid NOT NULL,
    clave_r2 text NOT NULL,
    nombre text NOT NULL,
    tamano_bytes integer NOT NULL,
    tipo_mime text DEFAULT 'application/pdf'::text NOT NULL,
    actualizado_por bigint NOT NULL,
    actualizado_en timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT documentos_pdf_nombre_check CHECK ((length(btrim(nombre)) > 0)),
    CONSTRAINT documentos_pdf_tamano_bytes_check CHECK (((tamano_bytes >= 1) AND (tamano_bytes <= 15728640))),
    CONSTRAINT documentos_pdf_tipo_mime_check CHECK ((tipo_mime = 'application/pdf'::text))
);


--
-- Name: pdf_cargas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pdf_cargas (
    id uuid NOT NULL,
    documento_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    clave_temporal text NOT NULL,
    clave_definitiva text NOT NULL,
    nombre text NOT NULL,
    tamano_bytes integer NOT NULL,
    vence_en timestamp with time zone NOT NULL,
    confirmada_en timestamp with time zone,
    creada_en timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    revision_esperada uuid,
    CONSTRAINT pdf_cargas_tamano_bytes_check CHECK (((tamano_bytes >= 1) AND (tamano_bytes <= 15728640)))
);


--
-- Name: pdf_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pdf_eventos (
    id bigint NOT NULL,
    documento_id bigint NOT NULL,
    actor_id bigint,
    accion text NOT NULL,
    revision uuid,
    fecha timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT pdf_eventos_accion_check CHECK ((accion = ANY (ARRAY['CARGA'::text, 'REEMPLAZO'::text, 'ELIMINACION'::text, 'LIMPIEZA_PENDIENTE'::text, 'LIMPIEZA_COMPLETADA'::text, 'RETENCION_14_DIAS_PENDIENTE'::text, 'RETENCION_14_DIAS_ELIMINADA'::text])))
);


--
-- Name: pdf_eventos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.pdf_eventos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.pdf_eventos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: pdf_objetos_pendientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pdf_objetos_pendientes (
    clave_r2 text NOT NULL,
    documento_id bigint NOT NULL,
    limpiar_desde timestamp with time zone NOT NULL,
    intentos integer DEFAULT 0 NOT NULL,
    eliminado_en timestamp with time zone,
    CONSTRAINT pdf_objetos_pendientes_intentos_check CHECK ((intentos >= 0))
);


--
-- Name: documentos_pdf documentos_pdf_clave_r2_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_pdf
    ADD CONSTRAINT documentos_pdf_clave_r2_key UNIQUE (clave_r2);


--
-- Name: documentos_pdf documentos_pdf_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_pdf
    ADD CONSTRAINT documentos_pdf_pkey PRIMARY KEY (documento_id);


--
-- Name: documentos_pdf documentos_pdf_revision_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_pdf
    ADD CONSTRAINT documentos_pdf_revision_key UNIQUE (revision);


--
-- Name: pdf_cargas pdf_cargas_clave_definitiva_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_cargas
    ADD CONSTRAINT pdf_cargas_clave_definitiva_key UNIQUE (clave_definitiva);


--
-- Name: pdf_cargas pdf_cargas_clave_temporal_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_cargas
    ADD CONSTRAINT pdf_cargas_clave_temporal_key UNIQUE (clave_temporal);


--
-- Name: pdf_cargas pdf_cargas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_cargas
    ADD CONSTRAINT pdf_cargas_pkey PRIMARY KEY (id);


--
-- Name: pdf_eventos pdf_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_eventos
    ADD CONSTRAINT pdf_eventos_pkey PRIMARY KEY (id);


--
-- Name: pdf_objetos_pendientes pdf_objetos_pendientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_objetos_pendientes
    ADD CONSTRAINT pdf_objetos_pendientes_pkey PRIMARY KEY (clave_r2);


--
-- Name: documentos_pdf a_proteger_historico; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_proteger_historico BEFORE INSERT OR DELETE OR UPDATE ON public.documentos_pdf FOR EACH ROW EXECUTE FUNCTION public.proteger_documento_historico();


--
-- Name: pdf_cargas a_proteger_historico; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_proteger_historico BEFORE INSERT OR DELETE OR UPDATE ON public.pdf_cargas FOR EACH ROW EXECUTE FUNCTION public.proteger_documento_historico();


--
-- Name: documentos_pdf auditar_pdf; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auditar_pdf AFTER INSERT OR DELETE OR UPDATE ON public.documentos_pdf FOR EACH ROW EXECUTE FUNCTION public.auditar_pdf();


--
-- Name: pdf_eventos no_truncar_pdf_eventos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_truncar_pdf_eventos BEFORE TRUNCATE ON public.pdf_eventos FOR EACH STATEMENT EXECUTE FUNCTION public.impedir_truncado();


--
-- Name: pdf_eventos proteger_pdf_eventos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER proteger_pdf_eventos BEFORE DELETE OR UPDATE ON public.pdf_eventos FOR EACH ROW EXECUTE FUNCTION public.impedir_cambio_historico();


--
-- Name: documentos_pdf validar_pdf_permiso; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_pdf_permiso BEFORE INSERT OR DELETE OR UPDATE ON public.documentos_pdf FOR EACH ROW EXECUTE FUNCTION public.validar_pdf_permiso();


--
-- Name: documentos_pdf documentos_pdf_actualizado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_pdf
    ADD CONSTRAINT documentos_pdf_actualizado_por_fkey FOREIGN KEY (actualizado_por) REFERENCES public.usuarios(id);


--
-- Name: documentos_pdf documentos_pdf_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_pdf
    ADD CONSTRAINT documentos_pdf_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos(id);


--
-- Name: pdf_cargas pdf_cargas_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_cargas
    ADD CONSTRAINT pdf_cargas_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.usuarios(id);


--
-- Name: pdf_cargas pdf_cargas_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_cargas
    ADD CONSTRAINT pdf_cargas_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos(id);


--
-- Name: pdf_eventos pdf_eventos_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_eventos
    ADD CONSTRAINT pdf_eventos_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.usuarios(id);


--
-- Name: pdf_eventos pdf_eventos_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_eventos
    ADD CONSTRAINT pdf_eventos_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos(id);


--
-- Name: pdf_objetos_pendientes pdf_objetos_pendientes_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_objetos_pendientes
    ADD CONSTRAINT pdf_objetos_pendientes_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos(id);
