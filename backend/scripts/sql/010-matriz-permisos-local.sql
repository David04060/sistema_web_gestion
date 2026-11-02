BEGIN;
DO $$ BEGIN IF current_database()<>'sistema_web_final' OR inet_server_addr()::text NOT IN ('127.0.0.1/32','::1/128') OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL THEN RAISE EXCEPTION 'Se requiere base local'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.fn_documento_permisos_contenido(doc bigint, lector bigint)
RETURNS TABLE(editar boolean,anular boolean) LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
WITH b AS (
 SELECT d.*,r.nombre rol,o.nombre oficina,f.situacion,f.tipo,f.usuario_id,
 a.nombre rol_autor,u.activo actor_activo,t.requiere_clave OR lower(btrim(t.nombre))='síseve' protegido
 FROM public.documentos d JOIN public.usuarios u ON u.id=lector JOIN public.roles r ON r.id=u.rol_id
 JOIN public.usuarios autor ON autor.id=d.registrado_por_id JOIN public.roles a ON a.id=autor.rol_id
 JOIN public.oficinas o ON o.id=d.oficina_responsable_id JOIN public.tipos_documentales t ON t.id=d.tipo_documental_id
 LEFT JOIN public.entregas_secretaria f ON f.documento_id=d.id WHERE d.id=doc
), reglas AS (
 SELECT *,actor_activo AND activo AND NOT protegido AND estado_tramite IN ('RECIBIDO','PENDIENTE_DECISION')
 AND NOT EXISTS(SELECT 1 FROM public.movimientos_documentales m WHERE m.documento_id=doc AND (m.estado='EN_TRASLADO' OR (m.estado='RECHAZADO' AND m.devolucion_confirmada_por_id IS NULL))) libre FROM b
)
SELECT libre AND CASE
 WHEN rol='Usuario' THEN responsable_actual_id=lector
 WHEN rol NOT IN ('Director(a)','Secretaria de Dirección') THEN false
 WHEN rol_autor='Usuario' THEN false
 WHEN situacion IN ('DELEGADO','ENTREGADO') THEN tipo='PERSONA' AND usuario_id IS NULL
 WHEN situacion='GUARDADO_DIRECCION' THEN true
 WHEN situacion='GUARDADO_SECRETARIA' OR oficina='Mesa de Partes' THEN rol='Secretaria de Dirección' AND registrado_por_id=lector AND responsable_actual_id=lector
 ELSE oficina='Dirección' END,
 libre AND rol='Secretaria de Dirección' AND registrado_por_id=lector AND responsable_actual_id=lector AND oficina='Mesa de Partes'
 AND coalesce(situacion,'PENDIENTE_DECISION') IN ('PENDIENTE_DECISION','GUARDADO_SECRETARIA') FROM reglas;
$$;
REVOKE ALL ON FUNCTION public.fn_documento_permisos_contenido(bigint,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_documento_permisos_contenido(bigint,bigint) TO sistema_web_app;
COMMIT;
