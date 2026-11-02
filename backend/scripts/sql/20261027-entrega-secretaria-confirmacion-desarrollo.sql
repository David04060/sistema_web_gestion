BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtext('administracion-institucional'));
DO $guarda$
BEGIN
 IF current_database() !~ '^sistema_web_final_qa_clasif_[a-f0-9]{32}$'
 OR inet_server_addr()::text NOT IN ('127.0.0.1/32','::1/128')
 OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL
 OR (SELECT oid::text FROM pg_database WHERE datname=current_database())
    IS DISTINCT FROM current_setting('app.clasificacion_destino_oid',true) THEN
  RAISE EXCEPTION 'La migración requiere la copia de desarrollo identificada';
 END IF;

END;
$guarda$;
-- Una confirmación conserva el destinatario histórico aunque después cambie su cuenta u oficina.
CREATE OR REPLACE FUNCTION fn_entrega_destino_coherente() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
 IF NEW.situacion='PENDIENTE_ENTREGA' THEN
  IF NEW.tipo IS NULL OR (NEW.tipo='PERSONA' AND (NEW.oficina_id IS NOT NULL OR NEW.usuario_id IS NOT NULL))
   OR (NEW.tipo='OFICINA' AND NEW.oficina_id IS NULL) OR (NEW.tipo='USUARIO' AND NEW.usuario_id IS NULL)
   OR (NEW.usuario_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM usuarios u WHERE u.id=NEW.usuario_id AND u.activo AND (NEW.oficina_id IS NULL OR u.oficina_id=NEW.oficina_id))) THEN
   RAISE EXCEPTION 'Destinatario incoherente' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;$f$;
COMMIT;
