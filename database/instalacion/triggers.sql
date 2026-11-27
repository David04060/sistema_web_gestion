-- Conecta cada cambio de tabla con sus validaciones e historia; BEFORE valida y AFTER registra sus efectos.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
-- Antes de registrar o cambiar datos, comprueba oficina y protección de periodos cerrados.
CREATE TRIGGER a_exigir_oficina_autor
  BEFORE INSERT ON public.documentos
  FOR EACH ROW
  EXECUTE FUNCTION public.exigir_oficina_autor ();

CREATE TRIGGER a_proteger_historico
  BEFORE INSERT OR DELETE OR UPDATE ON public.delegaciones_documento
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_documento_historico ();

CREATE TRIGGER a_proteger_historico
  BEFORE UPDATE ON public.documentos
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_documento_historico ();

CREATE TRIGGER a_proteger_historico
  BEFORE INSERT OR DELETE OR UPDATE ON public.documentos_pdf
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_documento_historico ();

CREATE TRIGGER a_proteger_historico
  BEFORE INSERT OR DELETE OR UPDATE ON public.pdf_cargas
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_documento_historico ();

CREATE TRIGGER a_proteger_historico
  BEFORE INSERT OR DELETE OR UPDATE ON public.ubicaciones_documento
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_documento_historico ();

-- Una constancia nueva actualiza la situación; las auditorías conservan el resultado del cambio.
CREATE TRIGGER aplicar_delegacion
  AFTER INSERT ON public.delegaciones_documento
  FOR EACH ROW
  EXECUTE FUNCTION public.aplicar_delegacion ();

CREATE TRIGGER aplicar_ubicacion
  AFTER INSERT ON public.ubicaciones_documento
  FOR EACH ROW
  EXECUTE FUNCTION public.aplicar_ubicacion ();

CREATE TRIGGER asignar_codigo_documental
  BEFORE INSERT ON public.documentos
  FOR EACH ROW
  EXECUTE FUNCTION public.asignar_codigo_documental ();

CREATE TRIGGER auditar_documento
  AFTER INSERT OR UPDATE ON public.documentos
  FOR EACH ROW
  EXECUTE FUNCTION public.auditar_documento ();

CREATE TRIGGER auditar_pdf
  AFTER INSERT OR DELETE OR UPDATE ON public.documentos_pdf
  FOR EACH ROW
  EXECUTE FUNCTION public.auditar_pdf ();

-- Se comprueba al confirmar la transacción, cuando ya se guardaron documento y constancias.
CREATE CONSTRAINT TRIGGER documento_estado_con_hecho
  AFTER INSERT OR UPDATE ON public.documentos DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_estado_final ();

-- Conserva registros e historia: impide borrados y el vaciado completo de tablas protegidas.
CREATE TRIGGER no_borrar_documento
  BEFORE DELETE ON public.documentos
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_borrado_documento ();

CREATE TRIGGER no_borrar_ubicacion
  BEFORE DELETE ON public.ubicaciones_documento
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_cambio_historico ();

CREATE TRIGGER no_truncar_auditoria
  BEFORE TRUNCATE ON public.auditoria_documental
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.impedir_truncado ();

CREATE TRIGGER no_truncar_configuracion
  BEFORE TRUNCATE ON public.auditoria_configuracion
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.impedir_truncado ();

CREATE TRIGGER no_truncar_delegaciones
  BEFORE TRUNCATE ON public.delegaciones_documento
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.impedir_truncado ();

CREATE TRIGGER no_truncar_documentos
  BEFORE TRUNCATE ON public.documentos
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.impedir_truncado ();

CREATE TRIGGER no_truncar_pdf_eventos
  BEFORE TRUNCATE ON public.pdf_eventos
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.impedir_truncado ();

CREATE TRIGGER no_truncar_relaciones
  BEFORE TRUNCATE ON public.documentos_relaciones
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.impedir_truncado ();

CREATE TRIGGER no_truncar_ubicaciones
  BEFORE TRUNCATE ON public.ubicaciones_documento
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.impedir_truncado ();

-- Protege decisiones de Dirección y hechos históricos frente a cambios posteriores.
CREATE TRIGGER proteger_anulacion_decidida_por_direccion
  BEFORE UPDATE OF situacion ON public.documentos
  FOR EACH ROW
  WHEN (((old.situacion IS DISTINCT FROM new.situacion) AND (new.situacion = 'ANULADO'::text)))
  EXECUTE FUNCTION public.proteger_anulacion_decidida_por_direccion ();

CREATE TRIGGER proteger_auditoria_configuracion
  BEFORE DELETE OR UPDATE ON public.auditoria_configuracion
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_cambio_historico ();

CREATE TRIGGER proteger_auditoria_documental
  BEFORE DELETE OR UPDATE ON public.auditoria_documental
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_cambio_historico ();

CREATE TRIGGER proteger_delegaciones
  BEFORE DELETE OR UPDATE ON public.delegaciones_documento
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_cambio_historico ();

CREATE TRIGGER proteger_pdf_eventos
  BEFORE DELETE OR UPDATE ON public.pdf_eventos
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_cambio_historico ();

CREATE TRIGGER proteger_relaciones
  BEFORE DELETE OR UPDATE ON public.documentos_relaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_cambio_historico ();

-- La asignación de oficina mantiene periodos; las demás validaciones rechazan datos incompatibles.
CREATE TRIGGER sincronizar_periodo_oficina
  AFTER INSERT OR UPDATE OF activo,
  oficina_id ON public.usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.sincronizar_periodo_oficina ();

CREATE TRIGGER validar_delegacion
  BEFORE INSERT ON public.delegaciones_documento
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_delegacion ();

CREATE TRIGGER validar_documento_actualizacion
  BEFORE UPDATE ON public.documentos
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_documento_actualizacion ();

CREATE TRIGGER validar_mapeo_tipo_relevo
  BEFORE INSERT ON public.tipos_relevo
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_mapeo_tipo_relevo ();

CREATE TRIGGER validar_miembro_ambito
  BEFORE INSERT OR UPDATE ON public.miembros_ambito
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_miembro_ambito ();

CREATE TRIGGER validar_pdf_permiso
  BEFORE INSERT OR DELETE OR UPDATE ON public.documentos_pdf
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_pdf_permiso ();

CREATE TRIGGER validar_relacion
  BEFORE INSERT ON public.documentos_relaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_relacion ();

CREATE TRIGGER validar_tipo_documental
  BEFORE INSERT ON public.tipos_documentales
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_tipo_documental ();

CREATE TRIGGER validar_ubicacion
  BEFORE INSERT ON public.ubicaciones_documento
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_ubicacion ();

CREATE TRIGGER validar_unidad_ubicacion
  BEFORE INSERT OR UPDATE ON public.unidades_ubicacion
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_unidad_ubicacion ();

CREATE TRIGGER validar_usuario_oficina
  BEFORE INSERT OR UPDATE ON public.usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_usuario_oficina ();

-- Después del cambio, programa retención y conserva la procedencia institucional del registro.
CREATE TRIGGER z_programar_retencion_pdf
  AFTER UPDATE OF situacion ON public.documentos
  FOR EACH ROW
  EXECUTE FUNCTION public.programar_retencion_pdf_anulado ();

CREATE TRIGGER z_registrar_oficina_documento
  AFTER INSERT ON public.documentos
  FOR EACH ROW
  EXECUTE FUNCTION public.registrar_oficina_documento ();

CREATE TRIGGER z_registrar_oficina_tipo
  AFTER INSERT ON public.tipos_documentales
  FOR EACH ROW
  EXECUTE FUNCTION public.registrar_oficina_tipo ();
