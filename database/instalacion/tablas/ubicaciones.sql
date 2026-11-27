-- Tipos documentales y lugares propios, con sus ubicaciones históricas.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
-- Catálogo de tipos y prefijos propios de un ámbito. La actividad limita nuevos registros.
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

ALTER TABLE public.tipos_documentales
  ALTER COLUMN id
  ADD GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME
    public.tipos_documentales_id_seq START WITH 1 INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1);

-- Conserva cada ubicación y su ruta al registrarla; vigente señala la ubicación actual.
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

ALTER TABLE public.ubicaciones_documento
  ALTER COLUMN id
  ADD GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME
    public.ubicaciones_documento_id_seq START WITH 1 INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1);

-- Árbol de lugares de una cuenta y oficina. padre_id enlaza cada elemento con su contenedor.
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

ALTER TABLE public.unidades_ubicacion
  ALTER COLUMN id
  ADD GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME
    public.unidades_ubicacion_id_seq START WITH 1 INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1);
