-- Registro, numeración y constancias de delegación y relación documental.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
-- Conserva el último número por ámbito, tipo y año; la función de alta lo incrementa con bloqueo.
CREATE TABLE public.correlativos_documentales (
  ambito_id bigint NOT NULL,
  tipo_id bigint NOT NULL,
  anio integer NOT NULL,
  ultimo_numero bigint NOT NULL,
  CONSTRAINT correlativos_documentales_anio_check CHECK (((anio >= 2000) AND (anio <= 9999))),
  CONSTRAINT correlativos_documentales_ultimo_numero_check CHECK ((ultimo_numero > 0))
);

-- Constancia del destino y de quien delega. La identidad propia permite varias constancias por documento.
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

-- Registro principal. Conserva nombres del tipo, clasificación, situación y revisión para evitar sobreescrituras.
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
  CONSTRAINT documentos_clasificacion_check CHECK ((clasificacion = ANY (ARRAY['RECIBIDO'::text,
    'EMITIDO'::text]))),
  CONSTRAINT documentos_correlativo_check CHECK ((correlativo > 0)),
  CONSTRAINT documentos_revision_check CHECK ((revision > 0)),
  CONSTRAINT documentos_situacion_check CHECK ((situacion = ANY (ARRAY['PENDIENTE_DIRECCION'::text,
    'EN_MESA_DE_PARTES'::text, 'GUARDADO_DIRECCION'::text, 'PERSONAL'::text, 'DELEGADO'::text,
    'ANULADO'::text])))
);

ALTER TABLE public.documentos
  ALTER COLUMN id
  ADD GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME
    public.documentos_id_seq START WITH 1 INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1);

-- Une un documento con su origen. Las reglas de consulta filtran cada integrante del grupo.
CREATE TABLE public.documentos_relaciones (
  documento_id bigint NOT NULL,
  origen_id bigint NOT NULL,
  creado_por bigint NOT NULL,
  creado_en timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  CONSTRAINT documentos_relaciones_check CHECK ((documento_id <> origen_id))
);
