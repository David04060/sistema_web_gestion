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
-- Habilita el flujo para antecedentes sin inventar asignaciones ni entregas.
-- No modifica documentos ni movimientos ni sus auditorías.
ALTER TABLE entregas_secretaria DISABLE TRIGGER entregas_secretaria_guardar;
INSERT INTO entregas_secretaria(documento_id)
 SELECT d.id FROM documentos d JOIN usuarios u ON u.id=d.registrado_por_id
 JOIN roles r ON r.id=u.rol_id JOIN tipos_documentales t ON t.id=d.tipo_documental_id
 WHERE r.nombre='Secretaria de Dirección' AND NOT t.requiere_clave AND lower(btrim(t.nombre))<>'síseve'
 ON CONFLICT DO NOTHING;
ALTER TABLE entregas_secretaria ENABLE TRIGGER entregas_secretaria_guardar;
-- La aplicación solo lee el historial; el trigger escribe bajo su propietario.
ALTER FUNCTION fn_entrega_secretaria_guardar() SECURITY DEFINER;
ALTER FUNCTION fn_entrega_secretaria_guardar() SET search_path=pg_catalog,public;
REVOKE INSERT ON entregas_secretaria_historial FROM sistema_web_app;
REVOKE USAGE ON SEQUENCE entregas_secretaria_historial_id_seq FROM sistema_web_app;
CREATE FUNCTION fn_entrega_destino_coherente() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
 IF NEW.situacion<>'PENDIENTE_ASIGNACION' THEN
  IF NEW.tipo IS NULL OR (NEW.tipo='PERSONA' AND (NEW.oficina_id IS NOT NULL OR NEW.usuario_id IS NOT NULL))
   OR (NEW.tipo='OFICINA' AND NEW.oficina_id IS NULL) OR (NEW.tipo='USUARIO' AND NEW.usuario_id IS NULL)
   OR (NEW.usuario_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM usuarios u WHERE u.id=NEW.usuario_id AND u.activo AND (NEW.oficina_id IS NULL OR u.oficina_id=NEW.oficina_id))) THEN
   RAISE EXCEPTION 'Destinatario incoherente' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;$f$;
CREATE TRIGGER aa_entrega_destino_coherente BEFORE INSERT OR UPDATE ON entregas_secretaria FOR EACH ROW EXECUTE FUNCTION fn_entrega_destino_coherente();
COMMIT;
