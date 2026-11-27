-- Historia de cambios de documentos y configuración, con actor y motivo.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
-- Registra quién cambió cuentas o catálogos, con motivo y valores anteriores y posteriores.
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

ALTER TABLE public.auditoria_configuracion
  ALTER COLUMN id
  ADD GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME
    public.auditoria_configuracion_id_seq START WITH 1 INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1);

-- Conserva cambios del documento. Corrección y anulación exigen un motivo no vacío.
CREATE TABLE public.auditoria_documental (
  id bigint NOT NULL,
  documento_id bigint NOT NULL,
  actor_id bigint NOT NULL,
  accion text NOT NULL,
  motivo text,
  anterior jsonb,
  posterior jsonb,
  fecha timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  CONSTRAINT auditoria_documental_check CHECK (((accion <> ALL (ARRAY['CORRECCION'::text,
    'ANULACION'::text])) OR (length(btrim(COALESCE(motivo, ''::text))) > 0)))
);

ALTER TABLE public.auditoria_documental
  ALTER COLUMN id
  ADD GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME
    public.auditoria_documental_id_seq START WITH 1 INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1);
