-- Corrección puntual del trigger instalado. No cambia permisos ni registros.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'sistema_web_documental_final'
    OR (SELECT oid FROM pg_database WHERE datname=current_database())<>98367
    OR inet_server_addr() NOT IN ('127.0.0.1'::inet,'::1'::inet)
 THEN RAISE EXCEPTION 'Esta corrección requiere la base documental local autorizada'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validar_delegacion() RETURNS trigger
 LANGUAGE plpgsql AS $$
DECLARE d documentos%ROWTYPE; rol smallint; oficina bigint; nombre_persona text;
BEGIN
 SELECT * INTO d FROM documentos WHERE id=NEW.documento_id FOR UPDATE;
 IF d.id IS NULL OR d.situacion NOT IN ('PENDIENTE_DIRECCION','EN_MESA_DE_PARTES','PERSONAL') THEN
   RAISE EXCEPTION 'Documento no delegable';
 END IF;
 SELECT rol_id INTO rol FROM usuarios WHERE id=NEW.delegado_por AND activo;
 IF ((d.situacion='PENDIENTE_DIRECCION' AND rol=3) OR
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
COMMIT;
