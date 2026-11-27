-- Instalador PostgreSQL 18 para una base NUEVA y VACÍA. Ejecutar con psql -X -v ON_ERROR_STOP=1 -f.
-- Orden: funciones, tablas/vistas y secuencias, restricciones/índices, triggers, claves foráneas y catálogos.
-- Solo DDL y catálogos técnicos; no contiene cuentas, documentos ni credenciales.
-- Los cuerpos de funciones definen escrituras futuras dentro de operaciones autorizadas.
BEGIN;
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
-- Name: auditar_pdf(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Registra eventos y auditoría PDF y encola objetos sustituidos para limpieza; no almacena binarios.
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
CREATE FUNCTION public.documento_delegado_por(actor bigint, doc bigint) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$

 SELECT concat_ws(' ', emisor.nombre, emisor.apellido)

 FROM public.delegaciones_documento e

 JOIN public.documentos d ON d.id=e.documento_id AND d.situacion='DELEGADO'

 JOIN public.usuarios u ON u.id=e.usuario_indicado_id AND u.activo

 JOIN public.usuarios emisor ON emisor.id=e.delegado_por

 WHERE e.documento_id=doc AND u.id=actor AND u.id<>d.registrado_por

 AND (u.rol_id=5 OR (u.rol_id IN (3,4) AND u.oficina_id IS NOT NULL))

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
-- Name: validar_delegacion(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Antes de insertar, verifica actor, situación y destino compatible. No permite delegaciones sucesivas ni cambio de ámbito.
CREATE FUNCTION public.validar_delegacion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$

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

END $$;


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
-- Name: validar_miembro_ambito(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Impide pertenencias incompatibles con rol y titularidad: ámbito compartido institucional o personal del usuario.
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

-- Contrato: Comprueba actor, alcance y situación en INSERT/UPDATE/DELETE de metadatos PDF, incluida la excepción de mantenimiento.
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
-- Name: validar_relacion(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Valida origen y nuevo documento, acceso y ausencia de autorreferencias/ciclos antes de crear la relación.
CREATE FUNCTION public.validar_relacion() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE hijo public.documentos%ROWTYPE; actor bigint;
BEGIN
 actor:=nullif(current_setting('app.actor_id',true),'')::bigint;
 SELECT * INTO hijo FROM public.documentos WHERE id=NEW.documento_id FOR SHARE;
 PERFORM 1 FROM public.documentos WHERE id=NEW.origen_id FOR SHARE;
 IF hijo.id IS NULL OR actor IS DISTINCT FROM NEW.creado_por OR hijo.registrado_por IS DISTINCT FROM actor
  OR hijo.situacion='ANULADO' OR public.documento_periodo_cerrado(hijo.id)
  OR NOT public.documento_consultable(actor,NEW.origen_id)
  OR EXISTS(SELECT 1 FROM public.documentos WHERE id=NEW.origen_id AND situacion='ANULADO') THEN
  RAISE EXCEPTION 'Origen no consultable o autor incompatible';
 END IF;
 IF NEW.documento_id=NEW.origen_id OR EXISTS(
  WITH RECURSIVE cadena(id) AS (
   SELECT NEW.origen_id UNION SELECT r.origen_id FROM public.documentos_relaciones r JOIN cadena c ON r.documento_id=c.id
  ) SELECT 1 FROM cadena WHERE id=NEW.documento_id
 ) THEN RAISE EXCEPTION 'Ciclo documental'; END IF;
 RETURN NEW;
END $$;


--
-- Name: validar_tipo_documental(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Comprueba ámbito y creador del tipo y normaliza sus datos para la numeración documental.
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
-- Name: validar_unidad_ubicacion(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrato: Valida dueño y padre de una unidad; rechaza padres ajenos y ciclos en el árbol.
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

-- Contrato: Exige oficina compatible con rol y actividad; permite conservar asignación anterior a una oficina inactiva.
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

-- Modelo: Alcance compartido institucional o personal de una cuenta.
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

-- Modelo: Cambios administrativos inmutables con actor, motivo y valores públicos.
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

-- Modelo: Historia de operaciones documentales y sus cambios.
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
-- Name: documentos_pdf; Type: TABLE; Schema: public; Owner: -
--

-- Modelo: Metadatos y referencia privada del único PDF vigente de cada documento.
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

-- Modelo: Vínculo del documento nuevo con su origen; base del recorrido de grupos.
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

-- Modelo: Pertenencia de cada cuenta a su ámbito; clave compuesta protege autor/ámbito.
CREATE TABLE public.miembros_ambito (
    usuario_id bigint NOT NULL,
    ambito_id bigint NOT NULL
);


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
-- Name: oficinas; Type: TABLE; Schema: public; Owner: -
--

-- Modelo: Catálogo de oficinas, con actividad y nombres institucionales reservados.
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

-- Modelo: Intenciones de carga con actor, vencimiento y revisión esperada.
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

-- Modelo: Auditoría técnica inmutable de las revisiones PDF.
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

-- Modelo: Cola durable de objetos R2 desvinculados y reintentos de eliminación.
CREATE TABLE public.pdf_objetos_pendientes (
    clave_r2 text NOT NULL,
    documento_id bigint NOT NULL,
    limpiar_desde timestamp with time zone NOT NULL,
    intentos integer DEFAULT 0 NOT NULL,
    eliminado_en timestamp with time zone,
    CONSTRAINT pdf_objetos_pendientes_intentos_check CHECK ((intentos >= 0))
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
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

-- Modelo: Códigos fijos de autorización; nombre visible editable sin cambiar semántica.
CREATE TABLE public.roles (
    id smallint NOT NULL,
    codigo text NOT NULL,
    nombre_visible text,
    CONSTRAINT roles_codigo_check CHECK ((codigo = ANY (ARRAY['SUPERADMINISTRADOR'::text, 'ADMINISTRADOR'::text, 'DIRECTOR'::text, 'SECRETARIA_DIRECCION'::text, 'USUARIO'::text]))),
    CONSTRAINT roles_nombre_visible_check CHECK (((nombre_visible IS NULL) OR ((char_length(btrim(nombre_visible)) >= 1) AND (char_length(btrim(nombre_visible)) <= 250))))
);


--
-- Name: tipos_documentales; Type: TABLE; Schema: public; Owner: -
--

-- Modelo: Tipos y prefijos únicos por ámbito para clasificación y correlativos.
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
-- Name: unidades_ubicacion; Type: TABLE; Schema: public; Owner: -
--

-- Modelo: Árbol personal de unidades, como estantes y archivadores.
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

-- Modelo: Identidad, hash scrypt, actividad, rol y versión de autenticación; sin filas iniciales.
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
-- Name: documentos_oficina documentos_oficina_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_oficina
    ADD CONSTRAINT documentos_oficina_pkey PRIMARY KEY (documento_id);


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
-- Name: oficina_periodos oficina_periodos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oficina_periodos
    ADD CONSTRAINT oficina_periodos_pkey PRIMARY KEY (id);


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
-- Name: documentos_oficina_periodo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documentos_oficina_periodo ON public.documentos_oficina USING btree (periodo_id);


--
-- Name: documentos_relaciones_origen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documentos_relaciones_origen ON public.documentos_relaciones USING btree (origen_id);


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
-- Name: usuarios_oficina_activa_unica; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuarios_oficina_activa_unica ON public.usuarios USING btree (oficina_id) WHERE (activo AND (oficina_id IS NOT NULL));


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
-- Name: documentos_pdf a_proteger_historico; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_proteger_historico BEFORE INSERT OR DELETE OR UPDATE ON public.documentos_pdf FOR EACH ROW EXECUTE FUNCTION public.proteger_documento_historico();


--
-- Name: pdf_cargas a_proteger_historico; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_proteger_historico BEFORE INSERT OR DELETE OR UPDATE ON public.pdf_cargas FOR EACH ROW EXECUTE FUNCTION public.proteger_documento_historico();


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
-- Name: documentos_pdf auditar_pdf; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auditar_pdf AFTER INSERT OR DELETE OR UPDATE ON public.documentos_pdf FOR EACH ROW EXECUTE FUNCTION public.auditar_pdf();


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
-- Name: documentos proteger_anulacion_decidida_por_direccion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER proteger_anulacion_decidida_por_direccion BEFORE UPDATE OF situacion ON public.documentos FOR EACH ROW WHEN (((old.situacion IS DISTINCT FROM new.situacion) AND (new.situacion = 'ANULADO'::text))) EXECUTE FUNCTION public.proteger_anulacion_decidida_por_direccion();


--
-- Name: auditoria_configuracion proteger_auditoria_configuracion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER proteger_auditoria_configuracion BEFORE DELETE OR UPDATE ON public.auditoria_configuracion FOR EACH ROW EXECUTE FUNCTION public.impedir_cambio_historico();


--
-- Name: auditoria_documental proteger_auditoria_documental; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER proteger_auditoria_documental BEFORE DELETE OR UPDATE ON public.auditoria_documental FOR EACH ROW EXECUTE FUNCTION public.impedir_cambio_historico();


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
-- Name: usuarios sincronizar_periodo_oficina; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sincronizar_periodo_oficina AFTER INSERT OR UPDATE OF activo, oficina_id ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.sincronizar_periodo_oficina();


--
-- Name: delegaciones_documento validar_delegacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_delegacion BEFORE INSERT ON public.delegaciones_documento FOR EACH ROW EXECUTE FUNCTION public.validar_delegacion();


--
-- Name: documentos validar_documento_actualizacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_documento_actualizacion BEFORE UPDATE ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.validar_documento_actualizacion();


--
-- Name: tipos_relevo validar_mapeo_tipo_relevo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validar_mapeo_tipo_relevo BEFORE INSERT ON public.tipos_relevo FOR EACH ROW EXECUTE FUNCTION public.validar_mapeo_tipo_relevo();


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
-- Name: documentos z_programar_retencion_pdf; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_programar_retencion_pdf AFTER UPDATE OF situacion ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.programar_retencion_pdf_anulado();


--
-- Name: documentos z_registrar_oficina_documento; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_registrar_oficina_documento AFTER INSERT ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.registrar_oficina_documento();


--
-- Name: tipos_documentales z_registrar_oficina_tipo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_registrar_oficina_tipo AFTER INSERT ON public.tipos_documentales FOR EACH ROW EXECUTE FUNCTION public.registrar_oficina_tipo();


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
-- Name: pdf_retenciones_anulacion pdf_retenciones_anulacion_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_retenciones_anulacion
    ADD CONSTRAINT pdf_retenciones_anulacion_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos(id);


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
-- PostgreSQL database dump complete
--

\unrestrict uWGQH7LHLDj48aLvvpEHnjXD4hZjcIzdCkj2LO0Jtuqt6dx3AOQMEHZ3RMw69SL


-- Catálogos mínimos de arranque: no representan usuarios ni documentos reales.
SET search_path = public;
INSERT INTO roles(id,codigo) VALUES(1,'SUPERADMINISTRADOR'),(2,'ADMINISTRADOR'),(3,'DIRECTOR'),(4,'SECRETARIA_DIRECCION'),(5,'USUARIO');
INSERT INTO oficinas(nombre) VALUES('Dirección'),('Mesa de Partes');
INSERT INTO ambitos_registro(clase) VALUES('COMPARTIDO_DIRECCION');
-- 26/11/2026. Ejecutar una sola vez sobre el esquema vigente, dentro de una transacción.
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
