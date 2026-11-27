-- DOCUMENTACIÓN del catálogo instalado: NO es una migración ni debe ejecutarse.
--
-- PostgreSQL database dump
--

\restrict uWGQH7LHLDj48aLvvpEHnjXD4hZjcIzdCkj2LO0Jtuqt6dx3AOQMEHZ3RMw69SL

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: documento_consultable(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Recibe actor y documento; devuelve lectura ordinaria por perfil, ámbito y periodos de oficina. Secretaría no tiene consulta personal general.
CREATE FUNCTION public.documento_consultable(actor bigint, doc bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT EXISTS(SELECT 1 FROM public.documentos d JOIN public.usuarios u ON u.id=actor AND u.activo
 LEFT JOIN public.miembros_ambito m ON m.usuario_id=u.id
 WHERE d.id=doc AND (u.rol_id=1 OR (d.situacion<>'ANULADO' AND (((u.rol_id=3 AND u.oficina_id IS NOT NULL) OR (u.rol_id=4 AND u.oficina_id IS NOT NULL AND (d.ambito_id=m.ambito_id OR EXISTS(SELECT 1 FROM public.documentos_oficina archivo JOIN public.oficina_periodos anterior ON anterior.id=archivo.periodo_id JOIN public.oficina_periodos vigente ON vigente.oficina_id=anterior.oficina_id AND vigente.fin IS NULL WHERE archivo.documento_id=d.id AND anterior.fin IS NOT NULL AND vigente.usuario_id=u.id AND vigente.oficina_id=u.oficina_id)))) OR (u.rol_id=5 AND
 (d.ambito_id=m.ambito_id OR EXISTS(SELECT 1 FROM public.documentos_oficina o JOIN public.oficina_periodos p ON p.id=o.periodo_id
 JOIN public.oficina_periodos actual ON actual.usuario_id=u.id AND actual.oficina_id=p.oficina_id AND actual.fin IS NULL
 WHERE o.documento_id=d.id AND p.fin IS NOT NULL)))))))
$$;


--
-- Name: documento_consultable_con_delegacion(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Amplía la lectura ordinaria con el destinatario registrado. El resultado booleano no concede escritura.
CREATE FUNCTION public.documento_consultable_con_delegacion(actor bigint, doc bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT public.documento_consultable(actor,doc)
 OR public.documento_delegado_por(actor,doc) IS NOT NULL
$$;


--
-- Name: documento_delegado_por(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Devuelve el nombre del emisor para una cuenta destinataria elegible; NULL significa que no hay acceso por esta delegación.
CREATE FUNCTION public.documento_delegado_por (actor bigint, doc bigint)
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


--
-- Name: documento_periodo_cerrado(bigint); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Indica si el documento pertenece a un periodo institucional cerrado, utilizado para impedir mutaciones históricas.
CREATE FUNCTION public.documento_periodo_cerrado(doc bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT EXISTS(SELECT 1 FROM public.documentos_oficina o JOIN public.oficina_periodos p ON p.id=o.periodo_id WHERE o.documento_id=doc AND p.fin IS NOT NULL)
$$;


--
-- Name: documento_tiene_relacion_consultable(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Indica si existe otro documento consultable en el grupo, incluida lectura por delegación. Lo usan filtros de listado y exportación.
CREATE FUNCTION public.documento_tiene_relacion_consultable(actor bigint, doc bigint) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT EXISTS(SELECT 1 FROM public.documentos_grupo(doc) g WHERE g.id<>doc
  AND public.documento_consultable_con_delegacion(actor,g.id))
$$;


--
-- Name: documento_tiene_relacion_visible(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Versión anterior del filtro de relaciones, basada en lectura ordinaria. Se conserva en el catálogo; no amplía permisos por delegación.
CREATE FUNCTION public.documento_tiene_relacion_visible(actor bigint, doc bigint) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT EXISTS(SELECT 1 FROM public.documentos_grupo(doc) g WHERE g.id<>doc
  AND public.documento_consultable(actor,g.id))
$$;


--
-- Name: es_finalizacion_retencion(bigint, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Reconoce el contexto interno de finalización de una revisión PDF; evita confundir mantenimiento con edición documental.
CREATE FUNCTION public.es_finalizacion_retencion(doc bigint, rev uuid, clave text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT current_setting('app.finalizar_retencion',true)='on'
 AND current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.pdf_retenciones_anulacion'::regclass))
 AND EXISTS(SELECT 1 FROM public.pdf_retenciones_anulacion r JOIN public.documentos d ON d.id=r.documento_id
 WHERE r.documento_id=doc AND r.revision=rev AND r.clave_r2=clave AND d.situacion='ANULADO'
 AND r.vence_en<=clock_timestamp() AND r.eliminado_en IS NULL)
$$;


--
-- Name: exigir_oficina_autor(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Valida al insertar que el autor documental cumple la oficina exigida para su rol.
CREATE FUNCTION public.exigir_oficina_autor() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.usuarios WHERE id=NEW.registrado_por AND rol_id IN(3,4) AND oficina_id IS NULL) THEN RAISE EXCEPTION 'Debe asignarse oficina antes de registrar'; END IF;
 RETURN NEW;
END $$;


--
-- Name: finalizar_retencion_pdf(bigint, uuid); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Finaliza una retención identificada por documento y revisión después de la eliminación externa; registra su evento técnico.
CREATE FUNCTION public.finalizar_retencion_pdf(doc bigint, rev uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE r public.pdf_retenciones_anulacion%ROWTYPE;
BEGIN
 PERFORM 1 FROM public.documentos WHERE id=doc AND situacion='ANULADO' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento no anulado'; END IF;
 SELECT * INTO STRICT r FROM public.pdf_retenciones_anulacion WHERE documento_id=doc FOR UPDATE;
 IF r.revision<>rev OR r.vence_en>clock_timestamp() THEN RAISE EXCEPTION 'Retención no vencida o revisión incompatible'; END IF;
 IF r.eliminado_en IS NOT NULL THEN RETURN; END IF;
 PERFORM set_config('app.finalizar_retencion','on',true);
 DELETE FROM public.documentos_pdf WHERE documento_id=doc AND revision=rev AND clave_r2=r.clave_r2;
 IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo PDF incompatible'; END IF;
 PERFORM set_config('app.finalizar_retencion','off',true);
 UPDATE public.pdf_retenciones_anulacion SET eliminado_en=clock_timestamp(),intentos=intentos+1 WHERE documento_id=doc;
 UPDATE public.pdf_objetos_pendientes SET eliminado_en=clock_timestamp() WHERE clave_r2=r.clave_r2;
 INSERT INTO public.pdf_eventos(documento_id,accion,revision) VALUES(doc,'RETENCION_14_DIAS_ELIMINADA',rev);
END $$;


--
-- Name: impedir_borrado_documento(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Rechaza DELETE de documentos: la operación de negocio es anular y conservar historial.
CREATE FUNCTION public.impedir_borrado_documento() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'Documento inmutable; usar anulación lógica'; END $$;


--
-- Name: impedir_cambio_historico(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Rechaza UPDATE/DELETE de hechos y auditorías inmutables.
CREATE FUNCTION public.impedir_cambio_historico() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'Registro histórico inmutable'; END $$;


--
-- Name: impedir_truncado(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Rechaza TRUNCATE de tablas documentales e históricas protegidas.
CREATE FUNCTION public.impedir_truncado() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'TRUNCATE de hechos prohibido'; END $$;


--
-- Name: programar_retencion_pdf_anulado(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Al anular, registra revisión y clave con su vencimiento de retención; no borra inmediatamente R2.
CREATE FUNCTION public.programar_retencion_pdf_anulado() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE fecha_anulacion timestamptz;
BEGIN
 IF NEW.situacion='ANULADO' AND OLD.situacion<>'ANULADO' THEN
  SELECT fecha INTO STRICT fecha_anulacion FROM public.auditoria_documental
   WHERE documento_id=NEW.id AND accion='ANULACION' ORDER BY id DESC LIMIT 1;
  INSERT INTO public.pdf_retenciones_anulacion(documento_id,revision,clave_r2,anulado_en)
   SELECT documento_id,revision,clave_r2,fecha_anulacion FROM public.documentos_pdf WHERE documento_id=NEW.id;
 END IF;
 RETURN NULL;
END $$;


--
-- Name: proteger_anulacion_decidida_por_direccion(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Impide anulación por Secretaría después de decisión de Dirección; valida actor transaccional y situación previa.
CREATE FUNCTION public.proteger_anulacion_decidida_por_direccion() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  -- La regla se suma a los controles de autoría y de periodo histórico existentes.
  -- En un alta de Secretaría, una delegación por otro actor solo se permite a Dirección.
  IF EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id=nullif(current_setting('app.actor_id',true),'')::bigint AND activo AND rol_id=4
  ) AND (
    OLD.situacion='GUARDADO_DIRECCION'
    OR (OLD.situacion='DELEGADO' AND EXISTS (
      SELECT 1 FROM public.delegaciones_documento
      WHERE documento_id=OLD.id AND delegado_por<>OLD.registrado_por
    ))
  ) THEN
    RAISE EXCEPTION 'Secretaría no puede anular después de la decisión de Dirección'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: proteger_documento_historico(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Rechaza cambios documentales/PDF sobre periodos cerrados, salvo la finalización interna de retención autorizada.
CREATE FUNCTION public.proteger_documento_historico() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE doc bigint;
BEGIN
 IF TG_TABLE_NAME='documentos' THEN doc:=OLD.id;
 ELSIF TG_OP='DELETE' THEN doc:=OLD.documento_id; ELSE
  IF TG_OP='UPDATE' THEN
   IF public.documento_periodo_cerrado(OLD.documento_id) THEN RAISE EXCEPTION 'Documento histórico: solo lectura' USING ERRCODE='42501'; END IF;
  END IF;
  doc:=NEW.documento_id;
 END IF;
 IF EXISTS(SELECT 1 FROM public.usuarios WHERE id=nullif(current_setting('app.actor_id',true),'')::bigint AND rol_id IN(3,4) AND oficina_id IS NULL) THEN
  RAISE EXCEPTION 'Cuenta institucional sin asignación' USING ERRCODE='42501';
 END IF;
 IF public.documento_periodo_cerrado(doc) THEN
  IF TG_TABLE_NAME='documentos_pdf' AND TG_OP='DELETE' THEN
   IF public.es_finalizacion_retencion(OLD.documento_id,OLD.revision,OLD.clave_r2) THEN RETURN OLD; END IF;
  END IF;
  RAISE EXCEPTION 'Documento de un periodo anterior: solo lectura' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;


--
-- Name: registrar_oficina_documento(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Vincula el alta al periodo de oficina vigente del autor para permitir consulta histórica tras relevo.
CREATE FUNCTION public.registrar_oficina_documento() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 INSERT INTO public.documentos_oficina(documento_id,periodo_id) SELECT NEW.id,p.id FROM public.oficina_periodos p
 JOIN public.usuarios u ON u.id=p.usuario_id AND u.activo AND u.oficina_id=p.oficina_id WHERE p.usuario_id=NEW.registrado_por AND p.fin IS NULL;
 RETURN NULL;
END $$;


--
-- Name: registrar_oficina_tipo(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Conserva la oficina de origen de un tipo documental para mapear tipos en relevos posteriores.
CREATE FUNCTION public.registrar_oficina_tipo() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 INSERT INTO public.tipos_oficina SELECT NEW.id,u.oficina_id FROM public.usuarios u WHERE u.id=NEW.creado_por AND u.oficina_id IS NOT NULL;
 RETURN NULL;
END $$;


--
-- Name: sincronizar_periodo_oficina(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Al cambiar actividad u oficina, cierra el periodo anterior y abre el vigente; conserva trazabilidad de titularidad.
CREATE FUNCTION public.sincronizar_periodo_oficina() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (NEW.activo,NEW.oficina_id) IS NOT DISTINCT FROM (OLD.activo,OLD.oficina_id) THEN RETURN NULL; END IF;
  UPDATE public.oficina_periodos SET fin=clock_timestamp() WHERE usuario_id=NEW.id AND fin IS NULL;
 END IF;
 IF NEW.activo AND NEW.oficina_id IS NOT NULL THEN
  INSERT INTO public.oficina_periodos(oficina_id,usuario_id) VALUES(NEW.oficina_id,NEW.id);
  INSERT INTO public.tipos_oficina(tipo_id,oficina_id)
   SELECT id,NEW.oficina_id FROM public.tipos_documentales WHERE creado_por=NEW.id
   ON CONFLICT (tipo_id) DO NOTHING;
 END IF;
 RETURN NULL;
END $$;


--
-- Name: validar_mapeo_tipo_relevo(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Valida que origen, destino y ámbito del tipo correspondan al relevo; evita asociaciones ajenas.
CREATE FUNCTION public.validar_mapeo_tipo_relevo() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=nullif(current_setting('app.actor_id',true),'')::bigint AND activo AND rol_id IN(1,2)) THEN RAISE EXCEPTION 'Mapeo de tipos requiere administración' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tipos_documentales origen JOIN public.tipos_oficina o ON o.tipo_id=origen.id
 JOIN public.usuarios u ON u.oficina_id=o.oficina_id AND u.activo AND u.rol_id=5
 JOIN public.miembros_ambito m ON m.usuario_id=u.id AND m.ambito_id=NEW.destino_ambito_id
 JOIN public.tipos_documentales destino ON destino.id=NEW.tipo_id AND destino.ambito_id=m.ambito_id
 WHERE origen.id=NEW.origen_id AND origen.activo AND destino.activo AND origen.nombre=destino.nombre AND origen.prefijo=destino.prefijo)
 THEN RAISE EXCEPTION 'Mapeo de tipos incompatible con oficina o catálogo'; END IF;
 RETURN NEW;
END $$;


--
-- Name: oficina_periodos; Type: TABLE; Schema: public; Owner: -
--

-- Modelo: Responsables de una oficina a lo largo del tiempo; fin NULL identifica vigencia.
CREATE TABLE public.oficina_periodos (
    id bigint NOT NULL,
    oficina_id bigint NOT NULL,
    usuario_id bigint NOT NULL,
    inicio timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    fin timestamp with time zone,
    CONSTRAINT oficina_periodos_check CHECK (((fin IS NULL) OR (fin >= inicio)))
);


--
-- Name: oficina_periodos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.oficina_periodos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.oficina_periodos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: pdf_retenciones_anulacion; Type: TABLE; Schema: public; Owner: -
--

-- Modelo: Retención por anulación, con revisión, clave, vencimiento y confirmación de eliminación.
CREATE TABLE public.pdf_retenciones_anulacion (
    documento_id bigint NOT NULL,
    revision uuid NOT NULL,
    clave_r2 text NOT NULL,
    anulado_en timestamp with time zone NOT NULL,
    vence_en timestamp with time zone GENERATED ALWAYS AS ((((anulado_en AT TIME ZONE 'UTC'::text) + '14 days'::interval) AT TIME ZONE 'UTC'::text)) STORED,
    reintentar_desde timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    intentos integer DEFAULT 0 NOT NULL,
    eliminado_en timestamp with time zone,
    CONSTRAINT pdf_retenciones_anulacion_check CHECK (((eliminado_en IS NULL) OR (eliminado_en >= vence_en))),
    CONSTRAINT pdf_retenciones_anulacion_intentos_check CHECK ((intentos >= 0))
);


--
-- Name: tipos_oficina; Type: TABLE; Schema: public; Owner: -
--

-- Modelo: Oficina histórica de origen de cada tipo documental.
CREATE TABLE public.tipos_oficina (
    tipo_id bigint NOT NULL,
    oficina_id bigint NOT NULL
);


--
-- Name: tipos_relevo; Type: TABLE; Schema: public; Owner: -
--

-- Modelo: Correspondencia de tipos entre ámbito saliente y entrante, sin mover documentos.
CREATE TABLE public.tipos_relevo (
    origen_id bigint NOT NULL,
    destino_ambito_id bigint NOT NULL,
    tipo_id bigint NOT NULL
);


--
-- Name: oficina_periodos oficina_periodos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oficina_periodos
    ADD CONSTRAINT oficina_periodos_pkey PRIMARY KEY (id);


--
-- Name: pdf_retenciones_anulacion pdf_retenciones_anulacion_clave_r2_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_retenciones_anulacion
    ADD CONSTRAINT pdf_retenciones_anulacion_clave_r2_key UNIQUE (clave_r2);


--
-- Name: pdf_retenciones_anulacion pdf_retenciones_anulacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_retenciones_anulacion
    ADD CONSTRAINT pdf_retenciones_anulacion_pkey PRIMARY KEY (documento_id);


--
-- Name: tipos_oficina tipos_oficina_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_oficina
    ADD CONSTRAINT tipos_oficina_pkey PRIMARY KEY (tipo_id);


--
-- Name: tipos_relevo tipos_relevo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_relevo
    ADD CONSTRAINT tipos_relevo_pkey PRIMARY KEY (origen_id, destino_ambito_id);


--
-- Name: ix_auditoria_documento_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_auditoria_documento_fecha ON public.auditoria_documental USING btree (documento_id, fecha, id);


--
-- Name: ix_documentos_ambito_situacion_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_documentos_ambito_situacion_fecha ON public.documentos USING btree (ambito_id, situacion, creado_en DESC);


--
-- Name: ix_documentos_autor_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_documentos_autor_fecha ON public.documentos USING btree (registrado_por, creado_en DESC);


--
-- Name: oficina_periodo_abierto; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX oficina_periodo_abierto ON public.oficina_periodos USING btree (oficina_id) WHERE (fin IS NULL);


--
-- Name: oficina_periodos_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oficina_periodos_usuario ON public.oficina_periodos USING btree (usuario_id, oficina_id);


--
-- Name: pdf_retenciones_pendientes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pdf_retenciones_pendientes ON public.pdf_retenciones_anulacion USING btree (vence_en, reintentar_desde) WHERE (eliminado_en IS NULL);


--
-- Name: usuario_periodo_abierto; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuario_periodo_abierto ON public.oficina_periodos USING btree (usuario_id) WHERE (fin IS NULL);


--
-- Name: ux_ambito_compartido; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_ambito_compartido ON public.ambitos_registro USING btree (clase) WHERE (clase = 'COMPARTIDO_DIRECCION'::text);


--
-- Name: ux_superadministrador_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_superadministrador_unico ON public.usuarios USING btree (rol_id) WHERE (rol_id = 1);


--
-- Name: ux_ubicacion_hija_nombre; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_ubicacion_hija_nombre ON public.unidades_ubicacion USING btree (propietario_id, padre_id, lower(clase), lower(nombre)) WHERE (padre_id IS NOT NULL);


--
-- Name: ux_ubicacion_raiz_nombre; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_ubicacion_raiz_nombre ON public.unidades_ubicacion USING btree (propietario_id, lower(clase), lower(nombre)) WHERE (padre_id IS NULL);


--
-- Name: ux_ubicacion_vigente; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_ubicacion_vigente ON public.ubicaciones_documento USING btree (documento_id) WHERE vigente;


--
-- Name: tipos_relevo validar_mapeo_tipo_relevo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_mapeo_tipo_relevo BEFORE INSERT ON public.tipos_relevo FOR EACH ROW EXECUTE FUNCTION public.validar_mapeo_tipo_relevo();


--
-- Name: oficina_periodos oficina_periodos_oficina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oficina_periodos
    ADD CONSTRAINT oficina_periodos_oficina_id_fkey FOREIGN KEY (oficina_id) REFERENCES public.oficinas(id);


--
-- Name: oficina_periodos oficina_periodos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oficina_periodos
    ADD CONSTRAINT oficina_periodos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: pdf_retenciones_anulacion pdf_retenciones_anulacion_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_retenciones_anulacion
    ADD CONSTRAINT pdf_retenciones_anulacion_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos(id);


--
-- Name: tipos_oficina tipos_oficina_oficina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_oficina
    ADD CONSTRAINT tipos_oficina_oficina_id_fkey FOREIGN KEY (oficina_id) REFERENCES public.oficinas(id);


--
-- Name: tipos_oficina tipos_oficina_tipo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_oficina
    ADD CONSTRAINT tipos_oficina_tipo_id_fkey FOREIGN KEY (tipo_id) REFERENCES public.tipos_documentales(id) ON DELETE CASCADE;


--
-- Name: tipos_relevo tipos_relevo_destino_ambito_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_relevo
    ADD CONSTRAINT tipos_relevo_destino_ambito_id_fkey FOREIGN KEY (destino_ambito_id) REFERENCES public.ambitos_registro(id);


--
-- Name: tipos_relevo tipos_relevo_origen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_relevo
    ADD CONSTRAINT tipos_relevo_origen_id_fkey FOREIGN KEY (origen_id) REFERENCES public.tipos_documentales(id);


--
-- Name: tipos_relevo tipos_relevo_tipo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_relevo
    ADD CONSTRAINT tipos_relevo_tipo_id_fkey FOREIGN KEY (tipo_id) REFERENCES public.tipos_documentales(id);
