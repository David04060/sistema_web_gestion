-- Periodos de oficina y procedencia de documentos y tipos tras un relevo.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
-- Asocia el documento al periodo de oficina del autor para su consulta tras un relevo.
CREATE TABLE public.documentos_oficina (
  documento_id bigint NOT NULL,
  periodo_id bigint NOT NULL
);

-- Responsable de una oficina durante un periodo; fin vacío identifica el periodo abierto.
CREATE TABLE public.oficina_periodos (
  id bigint NOT NULL,
  oficina_id bigint NOT NULL,
  usuario_id bigint NOT NULL,
  inicio timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  fin timestamp with time zone,
  CONSTRAINT oficina_periodos_check CHECK (((fin IS NULL) OR (fin >= inicio)))
);

ALTER TABLE public.oficina_periodos
  ALTER COLUMN id
  ADD GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME
    public.oficina_periodos_id_seq START WITH 1 INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1);

-- Conserva la oficina de procedencia del tipo documental.
CREATE TABLE public.tipos_oficina (
  tipo_id bigint NOT NULL,
  oficina_id bigint NOT NULL
);

-- Relaciona un tipo anterior con el tipo disponible en el ámbito de reemplazo.
CREATE TABLE public.tipos_relevo (
  origen_id bigint NOT NULL,
  destino_ambito_id bigint NOT NULL,
  tipo_id bigint NOT NULL
);
