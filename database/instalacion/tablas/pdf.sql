-- Metadatos de PDF, cargas temporales, eventos y tareas de limpieza y retención.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
-- Referencia del PDF vigente en R2 y su revisión; el archivo binario se guarda fuera de PostgreSQL.
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

-- Reserva una carga temporal, su vencimiento y la revisión que debe seguir vigente al confirmarla.
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

-- Deja constancia de cargas, reemplazos, eliminaciones y limpieza de archivos.
CREATE TABLE public.pdf_eventos (
  id bigint NOT NULL,
  documento_id bigint NOT NULL,
  actor_id bigint,
  accion text NOT NULL,
  revision uuid,
  fecha timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  CONSTRAINT pdf_eventos_accion_check CHECK ((accion = ANY (ARRAY['CARGA'::text, 'REEMPLAZO'::text,
    'ELIMINACION'::text, 'LIMPIEZA_PENDIENTE'::text, 'LIMPIEZA_COMPLETADA'::text, 'RETENCION_14_DIAS_PENDIENTE'::text,
    'RETENCION_14_DIAS_ELIMINADA'::text])))
);

ALTER TABLE public.pdf_eventos
  ALTER COLUMN id
  ADD GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME
    public.pdf_eventos_id_seq START WITH 1 INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1);

-- Cola persistente de objetos por retirar; un fallo conserva la tarea para reintentar.
CREATE TABLE public.pdf_objetos_pendientes (
  clave_r2 text NOT NULL,
  documento_id bigint NOT NULL,
  limpiar_desde timestamp with time zone NOT NULL,
  intentos integer DEFAULT 0 NOT NULL,
  eliminado_en timestamp with time zone,
  CONSTRAINT pdf_objetos_pendientes_intentos_check CHECK ((intentos >= 0))
);

-- Programa la retirada del PDF a los 14 días de la anulación y conserva intentos y resultado.
CREATE TABLE public.pdf_retenciones_anulacion (
  documento_id bigint NOT NULL,
  revision uuid NOT NULL,
  clave_r2 text NOT NULL,
  anulado_en timestamp with time zone NOT NULL,
  vence_en timestamp with time zone GENERATED ALWAYS AS ((((anulado_en AT TIME ZONE 'UTC'::text) +
    '14 days'::interval) AT TIME ZONE 'UTC'::text)) STORED,
  reintentar_desde timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  intentos integer DEFAULT 0 NOT NULL,
  eliminado_en timestamp with time zone,
  CONSTRAINT pdf_retenciones_anulacion_check CHECK (((eliminado_en IS NULL) OR (eliminado_en >= vence_en))),
  CONSTRAINT pdf_retenciones_anulacion_intentos_check CHECK ((intentos >= 0))
);
