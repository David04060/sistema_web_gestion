-- Incremental local: no modifica asignaciones ni datos existentes.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'sistema_web_documental_final' OR inet_server_addr()::text NOT IN ('::1/128','127.0.0.1/32') THEN RAISE EXCEPTION 'Destino local no autorizado'; END IF;
END $$;
SELECT pg_advisory_xact_lock(hashtext('documental-configuracion'));
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

COMMIT;
