-- Aplicación manual autorizada después de revisar 004. No cambia documentos ni triggers existentes.
BEGIN;
CREATE TABLE pdf_cargas (
 id uuid PRIMARY KEY, documento_id bigint NOT NULL REFERENCES documentos(id), actor_id bigint NOT NULL REFERENCES usuarios(id),
 temporal text UNIQUE NOT NULL, definitiva text UNIQUE NOT NULL, nombre text NOT NULL,
 tamano integer NOT NULL CHECK(tamano BETWEEN 1 AND 15728640), revision uuid,
 vence timestamptz NOT NULL, confirmado boolean NOT NULL DEFAULT false
);
CREATE TABLE pdf_objetos (
 clave text PRIMARY KEY, documento_id bigint NOT NULL REFERENCES documentos(id),
 limpiar_desde timestamptz NOT NULL, intentos integer NOT NULL DEFAULT 0,
 eliminado_en timestamptz
);
CREATE TABLE documentos_pdf (
 documento_id bigint PRIMARY KEY REFERENCES documentos(id), revision uuid UNIQUE NOT NULL,
 clave text UNIQUE NOT NULL REFERENCES pdf_objetos(clave), nombre text NOT NULL,
 tamano integer NOT NULL CHECK(tamano BETWEEN 1 AND 15728640),
 cargado_por bigint NOT NULL REFERENCES usuarios(id), cargado_en timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE pdf_eventos (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, documento_id bigint NOT NULL REFERENCES documentos(id),
 actor_id bigint REFERENCES usuarios(id), accion text NOT NULL CHECK(accion IN ('CARGA','REEMPLAZO','ELIMINACION','LIMPIEZA_COMPLETADA','LIMPIEZA_PENDIENTE')),
 fecha timestamptz NOT NULL DEFAULT clock_timestamp(), revision uuid
);
CREATE INDEX pdf_objetos_limpieza ON pdf_objetos(limpiar_desde) WHERE eliminado_en IS NULL;
CREATE INDEX pdf_cargas_actor ON pdf_cargas(actor_id,vence) WHERE NOT confirmado;
CREATE INDEX pdf_eventos_documento ON pdf_eventos(documento_id,fecha);
-- Privilegios del rol runtime vigente; sin permisos para borrar registros documentales.
GRANT SELECT,INSERT,UPDATE,DELETE ON documentos_pdf TO sistema_web_app;
GRANT SELECT,INSERT,UPDATE ON pdf_cargas,pdf_objetos TO sistema_web_app;
GRANT SELECT,INSERT ON pdf_eventos TO sistema_web_app;
GRANT USAGE,SELECT ON SEQUENCE pdf_eventos_id_seq TO sistema_web_app;
COMMIT;
