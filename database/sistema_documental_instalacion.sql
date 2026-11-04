-- DDL real exportado de sistema_web_documental_final. Solo instalación NUEVA vacía.
BEGIN;
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
-- Name: aplicar_delegacion(); Type: FUNCTION; Schema: public; Owner: -
--

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
-- Name: auditar_pdf(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auditar_pdf() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE actor bigint; accion text; doc bigint;
BEGIN
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
-- Name: auditar_valor_documento(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auditar_valor_documento() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE actor bigint; motivo text;
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO auditoria_documental(documento_id,actor_id,accion,posterior)
      SELECT NEW.documento_id,registrado_por,'CAMPO_REGISTRADO',to_jsonb(NEW)
      FROM documentos WHERE id=NEW.documento_id;
  ELSE
    actor:=nullif(current_setting('app.actor_id',true),'')::bigint;
    motivo:=current_setting('app.motivo',true);
    IF actor IS NULL OR length(btrim(coalesce(motivo,'')))=0 OR
       NOT EXISTS (SELECT 1 FROM documentos WHERE id=NEW.documento_id
                   AND registrado_por=actor AND situacion NOT IN ('ANULADO','DELEGADO')) THEN
      RAISE EXCEPTION 'Modificación de campo no autorizada';
    END IF;
    IF (NEW.documento_id,NEW.campo_id,NEW.nombre_guardado) IS DISTINCT FROM
       (OLD.documento_id,OLD.campo_id,OLD.nombre_guardado) THEN
      RAISE EXCEPTION 'Identidad y etiqueta histórica inmutables';
    END IF;
    INSERT INTO auditoria_documental(documento_id,actor_id,accion,motivo,anterior,posterior)
      VALUES (NEW.documento_id,actor,'CORRECCION',motivo,to_jsonb(OLD),to_jsonb(NEW));
  END IF;
  RETURN NULL;
END $$;


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
-- Name: validar_delegacion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.validar_delegacion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE d documentos%ROWTYPE; rol smallint; oficina bigint; nombre_persona text; titular bigint;
BEGIN
 SELECT * INTO d FROM documentos WHERE id=NEW.documento_id FOR UPDATE;
 IF d.id IS NULL OR d.situacion NOT IN ('PENDIENTE_DIRECCION','EN_MESA_DE_PARTES','PERSONAL','GUARDADO_DIRECCION') THEN
   RAISE EXCEPTION 'Documento no delegable';
 END IF;
 SELECT rol_id INTO rol FROM usuarios WHERE id=NEW.delegado_por AND activo;
 SELECT l.propietario_id INTO titular FROM ubicaciones_documento u
 JOIN unidades_ubicacion l ON l.id=u.unidad_id
 WHERE u.documento_id=d.id AND u.vigente FOR UPDATE OF u FOR SHARE OF l;
 IF titular IS NOT NULL AND titular<>NEW.delegado_por THEN
   RAISE EXCEPTION 'Ubicación vigente ajena';
 END IF;
 IF ((d.situacion IN ('PENDIENTE_DIRECCION','GUARDADO_DIRECCION') AND rol=3
      AND (d.situacion<>'GUARDADO_DIRECCION' OR titular=NEW.delegado_por)
      AND EXISTS (SELECT 1 FROM miembros_ambito m
        WHERE m.usuario_id=NEW.delegado_por AND m.ambito_id=d.ambito_id)) OR
     (d.situacion='EN_MESA_DE_PARTES' AND rol=4 AND d.registrado_por=NEW.delegado_por) OR
     (d.situacion='PERSONAL' AND rol=5 AND d.registrado_por=NEW.delegado_por)) IS DISTINCT FROM TRUE THEN
   RAISE EXCEPTION 'Actor sin permiso para delegar';
 END IF;
 IF NEW.usuario_indicado_id IS NOT NULL THEN
   SELECT u.oficina_id,u.nombre||' '||u.apellido INTO oficina,nombre_persona
     FROM usuarios u WHERE u.id=NEW.usuario_indicado_id AND u.activo;
   IF nombre_persona IS NULL OR
      (NEW.oficina_indicada_id IS NOT NULL AND oficina IS DISTINCT FROM NEW.oficina_indicada_id) OR
      NEW.nombre_persona_guardado IS DISTINCT FROM nombre_persona THEN
     RAISE EXCEPTION 'Persona u oficina indicada incompatible';
   END IF;
 END IF;
 RETURN NEW;
END $function$;



--
-- Name: validar_documento_actualizacion(); Type: FUNCTION; Schema: public; Owner: -
--

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

CREATE FUNCTION public.validar_estado_final() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE actual text; n integer;
BEGIN
  SELECT situacion INTO actual FROM documentos WHERE id=NEW.id;
  IF actual='DELEGADO' THEN
    SELECT count(*) INTO n FROM delegaciones_documento WHERE documento_id=NEW.id;
    IF n<>1 THEN RAISE EXCEPTION 'Delegación sin hecho asociado'; END IF;
  ELSIF actual='GUARDADO_DIRECCION' THEN
    SELECT count(*) INTO n FROM ubicaciones_documento u
      JOIN unidades_ubicacion lugar ON lugar.id=u.unidad_id
      JOIN usuarios propietario ON propietario.id=lugar.propietario_id
      WHERE u.documento_id=NEW.id AND u.vigente AND propietario.rol_id=3;
    IF n<>1 THEN RAISE EXCEPTION 'Guardado en Dirección sin ubicación'; END IF;
  END IF;
  RETURN NULL;
END $$;


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
-- Name: validar_pdf_permiso(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validar_pdf_permiso() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE doc bigint; actor bigint; rol smallint; d documentos%ROWTYPE; amb text;
BEGIN
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
-- Name: validar_relacion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validar_relacion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE hijo documentos%ROWTYPE; origen documentos%ROWTYPE;
BEGIN
  SELECT * INTO hijo FROM documentos WHERE id=NEW.documento_id FOR SHARE;
  SELECT * INTO origen FROM documentos WHERE id=NEW.origen_id FOR SHARE;
  IF hijo.ambito_id IS DISTINCT FROM origen.ambito_id OR hijo.registrado_por<>NEW.creado_por THEN
    RAISE EXCEPTION 'Relación fuera de ámbito o actor incompatible';
  END IF;
  IF EXISTS (WITH RECURSIVE cadena(id) AS (
    SELECT NEW.origen_id UNION ALL
    SELECT r.origen_id FROM documentos_relaciones r JOIN cadena c ON r.documento_id=c.id
  ) SELECT 1 FROM cadena WHERE id=NEW.documento_id) THEN
    RAISE EXCEPTION 'Ciclo documental';
  END IF;
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
-- Name: validar_ubicacion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.validar_ubicacion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
END $function$;



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
-- Name: validar_usuario_oficina(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.validar_usuario_oficina()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE o text;
BEGIN
  IF NEW.oficina_id IS NOT NULL AND
     (TG_OP='INSERT' OR NEW.oficina_id IS DISTINCT FROM OLD.oficina_id) AND
     NOT EXISTS(SELECT 1 FROM public.oficinas WHERE id=NEW.oficina_id AND activa) THEN
    RAISE EXCEPTION 'Una oficina inactiva no admite nuevas asignaciones';
  END IF;
  IF NEW.rol_id=3 THEN
    SELECT nombre INTO o FROM oficinas WHERE id=NEW.oficina_id;
    IF o IS DISTINCT FROM 'Dirección' THEN RAISE EXCEPTION 'Dirección requiere su oficina'; END IF;
  ELSIF NEW.rol_id=4 THEN
    SELECT nombre INTO o FROM oficinas WHERE id=NEW.oficina_id;
    IF o IS DISTINCT FROM 'Mesa de Partes' THEN RAISE EXCEPTION 'Secretaría requiere Mesa de Partes'; END IF;
  ELSIF NEW.rol_id IN (1,2) AND NEW.oficina_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cuenta administrativa sin oficina documental';
  END IF;
  IF NEW.rol_id=5 AND EXISTS(SELECT 1 FROM oficinas WHERE id=NEW.oficina_id AND nombre IN('Dirección','Mesa de Partes')) THEN RAISE EXCEPTION 'Usuario no puede asignarse a Dirección ni Mesa de Partes'; END IF;
  NEW.actualizada_en:=clock_timestamp();
  RETURN NEW;
END $function$;



--
-- Name: validar_valor_documento(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validar_valor_documento() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE propietario bigint; autor bigint; etiqueta text;
BEGIN
  SELECT usuario_id,nombre_actual INTO propietario,etiqueta FROM campos_opcionales WHERE id=NEW.campo_id;
  SELECT registrado_por INTO autor FROM documentos WHERE id=NEW.documento_id;
  IF propietario IS DISTINCT FROM autor OR NEW.nombre_guardado IS DISTINCT FROM etiqueta THEN
    RAISE EXCEPTION 'Campo ajeno o etiqueta histórica incorrecta';
  END IF;
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
-- Name: correlativos_documentales; Type: TABLE; Schema: public; Owner: -
--

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

CREATE TABLE public.delegaciones_documento (
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
-- Name: documentos_relaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentos_relaciones (
    documento_id bigint NOT NULL,
    origen_id bigint NOT NULL,
    creado_por bigint NOT NULL,
    creado_en timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT documentos_relaciones_check CHECK ((documento_id <> origen_id))
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
    CONSTRAINT pdf_eventos_accion_check CHECK ((accion = ANY (ARRAY['CARGA'::text, 'REEMPLAZO'::text, 'ELIMINACION'::text, 'LIMPIEZA_PENDIENTE'::text, 'LIMPIEZA_COMPLETADA'::text])))
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
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id smallint NOT NULL,
    codigo text NOT NULL,
    CONSTRAINT roles_codigo_check CHECK ((codigo = ANY (ARRAY['SUPERADMINISTRADOR'::text, 'ADMINISTRADOR'::text, 'DIRECTOR'::text, 'SECRETARIA_DIRECCION'::text, 'USUARIO'::text])))
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
-- Name: ubicaciones_documento; Type: TABLE; Schema: public; Owner: -
--

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
-- Name: valores_documento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.valores_documento (
    documento_id bigint NOT NULL,
    campo_id bigint NOT NULL,
    nombre_guardado text NOT NULL,
    valor text NOT NULL
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
-- Name: correlativos_documentales correlativos_documentales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.correlativos_documentales
    ADD CONSTRAINT correlativos_documentales_pkey PRIMARY KEY (ambito_id, tipo_id, anio);


--
-- Name: delegaciones_documento delegaciones_documento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegaciones_documento
    ADD CONSTRAINT delegaciones_documento_pkey PRIMARY KEY (documento_id);


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
-- Name: ubicaciones_documento ubicaciones_documento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ubicaciones_documento
    ADD CONSTRAINT ubicaciones_documento_pkey PRIMARY KEY (id);


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
-- Name: valores_documento valores_documento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valores_documento
    ADD CONSTRAINT valores_documento_pkey PRIMARY KEY (documento_id, campo_id);


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
-- Name: documentos_pdf auditar_pdf; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auditar_pdf AFTER INSERT OR DELETE OR UPDATE ON public.documentos_pdf FOR EACH ROW EXECUTE FUNCTION public.auditar_pdf();


--
-- Name: valores_documento auditar_valor_documento; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auditar_valor_documento AFTER INSERT OR UPDATE ON public.valores_documento FOR EACH ROW EXECUTE FUNCTION public.auditar_valor_documento();


--
-- Name: documentos documento_estado_con_hecho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER documento_estado_con_hecho AFTER INSERT OR UPDATE ON public.documentos DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validar_estado_final();


--
-- Name: campos_opcionales no_borrar_campo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_borrar_campo BEFORE DELETE ON public.campos_opcionales FOR EACH ROW EXECUTE FUNCTION public.impedir_cambio_historico();


--
-- Name: documentos no_borrar_documento; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_borrar_documento BEFORE DELETE ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.impedir_borrado_documento();


--
-- Name: ubicaciones_documento no_borrar_ubicacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_borrar_ubicacion BEFORE DELETE ON public.ubicaciones_documento FOR EACH ROW EXECUTE FUNCTION public.impedir_cambio_historico();


--
-- Name: valores_documento no_borrar_valor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_borrar_valor BEFORE DELETE ON public.valores_documento FOR EACH ROW EXECUTE FUNCTION public.impedir_cambio_historico();


--
-- Name: auditoria_documental no_truncar_auditoria; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_truncar_auditoria BEFORE TRUNCATE ON public.auditoria_documental FOR EACH STATEMENT EXECUTE FUNCTION public.impedir_truncado();


--
-- Name: auditoria_configuracion no_truncar_configuracion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_truncar_configuracion BEFORE TRUNCATE ON public.auditoria_configuracion FOR EACH STATEMENT EXECUTE FUNCTION public.impedir_truncado();


--
-- Name: delegaciones_documento no_truncar_delegaciones; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_truncar_delegaciones BEFORE TRUNCATE ON public.delegaciones_documento FOR EACH STATEMENT EXECUTE FUNCTION public.impedir_truncado();


--
-- Name: documentos no_truncar_documentos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_truncar_documentos BEFORE TRUNCATE ON public.documentos FOR EACH STATEMENT EXECUTE FUNCTION public.impedir_truncado();


--
-- Name: pdf_eventos no_truncar_pdf_eventos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_truncar_pdf_eventos BEFORE TRUNCATE ON public.pdf_eventos FOR EACH STATEMENT EXECUTE FUNCTION public.impedir_truncado();


--
-- Name: documentos_relaciones no_truncar_relaciones; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_truncar_relaciones BEFORE TRUNCATE ON public.documentos_relaciones FOR EACH STATEMENT EXECUTE FUNCTION public.impedir_truncado();


--
-- Name: ubicaciones_documento no_truncar_ubicaciones; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_truncar_ubicaciones BEFORE TRUNCATE ON public.ubicaciones_documento FOR EACH STATEMENT EXECUTE FUNCTION public.impedir_truncado();


--
-- Name: valores_documento no_truncar_valores; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_truncar_valores BEFORE TRUNCATE ON public.valores_documento FOR EACH STATEMENT EXECUTE FUNCTION public.impedir_truncado();


--
-- Name: auditoria_configuracion proteger_auditoria_configuracion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER proteger_auditoria_configuracion BEFORE DELETE OR UPDATE ON public.auditoria_configuracion FOR EACH ROW EXECUTE FUNCTION public.impedir_cambio_historico();


--
-- Name: auditoria_documental proteger_auditoria_documental; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER proteger_auditoria_documental BEFORE DELETE OR UPDATE ON public.auditoria_documental FOR EACH ROW EXECUTE FUNCTION public.impedir_cambio_historico();


--
-- Name: cambios_nombre_campo proteger_cambios_campo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER proteger_cambios_campo BEFORE DELETE OR UPDATE ON public.cambios_nombre_campo FOR EACH ROW EXECUTE FUNCTION public.impedir_cambio_historico();


--
-- Name: delegaciones_documento proteger_delegaciones; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER proteger_delegaciones BEFORE DELETE OR UPDATE ON public.delegaciones_documento FOR EACH ROW EXECUTE FUNCTION public.impedir_cambio_historico();


--
-- Name: pdf_eventos proteger_pdf_eventos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER proteger_pdf_eventos BEFORE DELETE OR UPDATE ON public.pdf_eventos FOR EACH ROW EXECUTE FUNCTION public.impedir_cambio_historico();


--
-- Name: documentos_relaciones proteger_relaciones; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER proteger_relaciones BEFORE DELETE OR UPDATE ON public.documentos_relaciones FOR EACH ROW EXECUTE FUNCTION public.impedir_cambio_historico();


--
-- Name: campos_opcionales registrar_cambio_nombre_campo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER registrar_cambio_nombre_campo BEFORE UPDATE ON public.campos_opcionales FOR EACH ROW EXECUTE FUNCTION public.registrar_cambio_nombre_campo();


--
-- Name: delegaciones_documento validar_delegacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_delegacion BEFORE INSERT ON public.delegaciones_documento FOR EACH ROW EXECUTE FUNCTION public.validar_delegacion();


--
-- Name: documentos validar_documento_actualizacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_documento_actualizacion BEFORE UPDATE ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.validar_documento_actualizacion();


--
-- Name: miembros_ambito validar_miembro_ambito; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_miembro_ambito BEFORE INSERT OR UPDATE ON public.miembros_ambito FOR EACH ROW EXECUTE FUNCTION public.validar_miembro_ambito();


--
-- Name: documentos_pdf validar_pdf_permiso; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_pdf_permiso BEFORE INSERT OR DELETE OR UPDATE ON public.documentos_pdf FOR EACH ROW EXECUTE FUNCTION public.validar_pdf_permiso();


--
-- Name: documentos_relaciones validar_relacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_relacion BEFORE INSERT ON public.documentos_relaciones FOR EACH ROW EXECUTE FUNCTION public.validar_relacion();


--
-- Name: tipos_documentales validar_tipo_documental; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_tipo_documental BEFORE INSERT ON public.tipos_documentales FOR EACH ROW EXECUTE FUNCTION public.validar_tipo_documental();


--
-- Name: ubicaciones_documento validar_ubicacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_ubicacion BEFORE INSERT ON public.ubicaciones_documento FOR EACH ROW EXECUTE FUNCTION public.validar_ubicacion();


--
-- Name: unidades_ubicacion validar_unidad_ubicacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_unidad_ubicacion BEFORE INSERT OR UPDATE ON public.unidades_ubicacion FOR EACH ROW EXECUTE FUNCTION public.validar_unidad_ubicacion();


--
-- Name: usuarios validar_usuario_oficina; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_usuario_oficina BEFORE INSERT OR UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.validar_usuario_oficina();


--
-- Name: valores_documento validar_valor_documento; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_valor_documento BEFORE INSERT ON public.valores_documento FOR EACH ROW EXECUTE FUNCTION public.validar_valor_documento();


--
-- Name: ambitos_registro ambitos_registro_titular_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ambitos_registro
    ADD CONSTRAINT ambitos_registro_titular_id_fkey FOREIGN KEY (titular_id) REFERENCES public.usuarios(id);


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
-- Name: valores_documento valores_documento_campo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valores_documento
    ADD CONSTRAINT valores_documento_campo_id_fkey FOREIGN KEY (campo_id) REFERENCES public.campos_opcionales(id);


--
-- Name: valores_documento valores_documento_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valores_documento
    ADD CONSTRAINT valores_documento_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos(id);


--
-- PostgreSQL database dump complete
--

\unrestrict zmMsG8IhrmJ7p8UA5S0qavQRSSBeH5xCUkldp9U7OhYAnPtWZ44qEmHQbx5aRHl


INSERT INTO roles(id,codigo) VALUES(1,'SUPERADMINISTRADOR'),(2,'ADMINISTRADOR'),(3,'DIRECTOR'),(4,'SECRETARIA_DIRECCION'),(5,'USUARIO');
INSERT INTO oficinas(nombre) VALUES('Dirección'),('Mesa de Partes');
INSERT INTO ambitos_registro(clase) VALUES('COMPARTIDO_DIRECCION');
COMMIT;
