-- DOCUMENTACIÓN del catálogo instalado: NO es una migración ni debe ejecutarse.
--
-- PostgreSQL database dump
--

\restrict zmMsG8IhrmJ7p8UA5S0qavQRSSBeH5xCUkldp9U7OhYAnPtWZ44qEmHQbx5aRHl

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
-- Name: impedir_borrado_documento(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.impedir_borrado_documento() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'Documento inmutable; usar anulación lógica'; END $$;


--
-- Name: impedir_cambio_historico(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.impedir_cambio_historico() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'Registro histórico inmutable'; END $$;


--
-- Name: impedir_truncado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.impedir_truncado() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'TRUNCATE de hechos prohibido'; END $$;


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
-- Name: ix_documentos_relaciones_origen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_documentos_relaciones_origen ON public.documentos_relaciones USING btree (origen_id);


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


