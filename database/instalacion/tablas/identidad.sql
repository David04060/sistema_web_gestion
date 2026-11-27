-- Cuentas, roles, oficinas y pertenencia al ámbito compartido o personal.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
-- Define si los registros pertenecen a una cuenta o al ámbito compartido institucional.
CREATE TABLE public.ambitos_registro (
  id bigint NOT NULL,
  clase text NOT NULL,
  titular_id bigint,
  creado_en timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  CONSTRAINT ambitos_registro_check CHECK (((clase = 'PERSONAL'::text) = (titular_id IS NOT NULL))),
  CONSTRAINT ambitos_registro_clase_check CHECK ((clase = ANY (ARRAY['COMPARTIDO_DIRECCION'::text, 'PERSONAL'::text])))
);

ALTER TABLE public.ambitos_registro
  ALTER COLUMN id
  ADD GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME
    public.ambitos_registro_id_seq START WITH 1 INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1);

-- Vincula cada cuenta con el conjunto de registros en el que puede operar.
CREATE TABLE public.miembros_ambito (
  usuario_id bigint NOT NULL,
  ambito_id bigint NOT NULL
);

-- Catálogo de oficinas; la actividad controla nuevas asignaciones sin borrar su historia.
CREATE TABLE public.oficinas (
  id bigint NOT NULL,
  nombre text NOT NULL,
  activa boolean DEFAULT true NOT NULL,
  creada_en timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  CONSTRAINT oficinas_nombre_check CHECK ((length(btrim(nombre)) > 0))
);

ALTER TABLE public.oficinas
  ALTER COLUMN id
  ADD GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME
    public.oficinas_id_seq START WITH 1 INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1);

-- Códigos estables de permiso y nombre visible que puede personalizarse.
CREATE TABLE public.roles (
  id smallint NOT NULL,
  codigo text NOT NULL,
  nombre_visible text,
  CONSTRAINT roles_codigo_check CHECK ((codigo = ANY (ARRAY['SUPERADMINISTRADOR'::text, 'ADMINISTRADOR'::text,
    'DIRECTOR'::text, 'SECRETARIA_DIRECCION'::text, 'USUARIO'::text]))),
  CONSTRAINT roles_nombre_visible_check CHECK (((nombre_visible IS NULL) OR
    ((char_length(btrim(nombre_visible)) >= 1) AND (char_length(btrim(nombre_visible)) <= 250))))
);

-- Identidad, perfil y oficina de cada cuenta. Guarda un hash para comprobar la contraseña sin conservarla.
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

ALTER TABLE public.usuarios
  ALTER COLUMN id
  ADD GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME
    public.usuarios_id_seq START WITH 1 INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1);
