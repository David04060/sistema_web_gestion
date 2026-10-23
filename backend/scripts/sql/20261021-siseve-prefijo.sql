-- DML autorizado: prefijo elegido por el usuario, normalizado a mayusculas.
-- No cambia tablas, funciones, restricciones ni estados.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(hashtext('administracion-institucional'));
DO $$
DECLARE tipo_id bigint; actor_id bigint; prefijo_actual text;
BEGIN
 IF current_database()<>'sistema_web_final' THEN RAISE EXCEPTION 'Base no autorizada'; END IF;
 SELECT id,prefijo_codigo INTO tipo_id,prefijo_actual FROM tipos_documentales WHERE nombre='SíseVe' AND requiere_clave FOR UPDATE;
 IF tipo_id IS NULL THEN RAISE EXCEPTION 'Falta el tipo institucional restringido'; END IF;
 IF prefijo_actual IS NOT NULL AND prefijo_actual<>'SISEVE' THEN RAISE EXCEPTION 'Prefijo existente distinto al autorizado'; END IF;
 IF EXISTS(SELECT 1 FROM tipos_documentales WHERE prefijo_codigo='SISEVE' AND id<>tipo_id) THEN RAISE EXCEPTION 'Prefijo en uso'; END IF;
 IF prefijo_actual IS NULL AND EXISTS(SELECT 1 FROM documentos WHERE tipo_documental_id=tipo_id) THEN RAISE EXCEPTION 'Revisar referencias historicas antes de cambiar prefijo'; END IF;
 SELECT u.id INTO actor_id FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.activo AND r.nombre='Administrador' ORDER BY u.id LIMIT 1;
 IF actor_id IS NULL THEN RAISE EXCEPTION 'Falta actor administrativo para auditoria'; END IF;
 PERFORM set_config('app.usuario_actor_id',actor_id::text,true);
 UPDATE tipos_documentales SET prefijo_codigo='SISEVE' WHERE id=tipo_id AND prefijo_codigo IS NULL;
END $$;
COMMIT;
