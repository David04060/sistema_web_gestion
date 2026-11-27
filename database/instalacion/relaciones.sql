-- Impide referencias a cuentas, documentos, oficinas, tipos o lugares inexistentes o incompatibles.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
ALTER TABLE ONLY public.ambitos_registro
  ADD CONSTRAINT ambitos_registro_titular_id_fkey FOREIGN KEY (titular_id) REFERENCES public.usuarios (id);

ALTER TABLE ONLY public.auditoria_configuracion
  ADD CONSTRAINT auditoria_configuracion_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.usuarios (id);

ALTER TABLE ONLY public.auditoria_documental
  ADD CONSTRAINT auditoria_documental_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.usuarios (id);

ALTER TABLE ONLY public.auditoria_documental
  ADD CONSTRAINT auditoria_documental_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos (id);

ALTER TABLE ONLY public.correlativos_documentales
  ADD CONSTRAINT correlativos_documentales_tipo_id_ambito_id_fkey FOREIGN KEY (tipo_id, ambito_id) REFERENCES
    public.tipos_documentales (id, ambito_id);

ALTER TABLE ONLY public.delegaciones_documento
  ADD CONSTRAINT delegaciones_documento_delegado_por_fkey FOREIGN KEY (delegado_por) REFERENCES public.usuarios (id);

ALTER TABLE ONLY public.delegaciones_documento
  ADD CONSTRAINT delegaciones_documento_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos (id);

ALTER TABLE ONLY public.delegaciones_documento
  ADD CONSTRAINT delegaciones_documento_oficina_indicada_id_fkey FOREIGN KEY (oficina_indicada_id) REFERENCES
    public.oficinas (id);

ALTER TABLE ONLY public.delegaciones_documento
  ADD CONSTRAINT delegaciones_documento_usuario_indicado_id_fkey FOREIGN KEY (usuario_indicado_id) REFERENCES
    public.usuarios (id);

ALTER TABLE ONLY public.delegaciones_documento
  ADD CONSTRAINT delegaciones_documento_usuario_indicado_id_oficina_indicad_fkey FOREIGN KEY
    (usuario_indicado_id, oficina_indicada_id) REFERENCES public.usuarios (id, oficina_id);

ALTER TABLE ONLY public.documentos
  ADD CONSTRAINT documentos_ambito_id_registrado_por_fkey FOREIGN KEY (ambito_id, registrado_por) REFERENCES
    public.miembros_ambito (ambito_id, usuario_id);

ALTER TABLE ONLY public.documentos_oficina
  ADD CONSTRAINT documentos_oficina_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos (id);

ALTER TABLE ONLY public.documentos_oficina
  ADD CONSTRAINT documentos_oficina_periodo_id_fkey FOREIGN KEY (periodo_id) REFERENCES public.oficina_periodos (id);

ALTER TABLE ONLY public.documentos_pdf
  ADD CONSTRAINT documentos_pdf_actualizado_por_fkey FOREIGN KEY (actualizado_por) REFERENCES public.usuarios (id);

ALTER TABLE ONLY public.documentos_pdf
  ADD CONSTRAINT documentos_pdf_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos (id);

ALTER TABLE ONLY public.documentos_relaciones
  ADD CONSTRAINT documentos_relaciones_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios (id);

ALTER TABLE ONLY public.documentos_relaciones
  ADD CONSTRAINT documentos_relaciones_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos (id);

ALTER TABLE ONLY public.documentos_relaciones
  ADD CONSTRAINT documentos_relaciones_origen_id_fkey FOREIGN KEY (origen_id) REFERENCES public.documentos (id);

ALTER TABLE ONLY public.documentos
  ADD CONSTRAINT documentos_tipo_id_ambito_id_fkey FOREIGN KEY (tipo_id, ambito_id) REFERENCES
    public.tipos_documentales (id, ambito_id);

ALTER TABLE ONLY public.miembros_ambito
  ADD CONSTRAINT miembros_ambito_ambito_id_fkey FOREIGN KEY (ambito_id) REFERENCES public.ambitos_registro (id);

ALTER TABLE ONLY public.miembros_ambito
  ADD CONSTRAINT miembros_ambito_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios (id);

ALTER TABLE ONLY public.oficina_periodos
  ADD CONSTRAINT oficina_periodos_oficina_id_fkey FOREIGN KEY (oficina_id) REFERENCES public.oficinas (id);

ALTER TABLE ONLY public.oficina_periodos
  ADD CONSTRAINT oficina_periodos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios (id);

ALTER TABLE ONLY public.pdf_cargas
  ADD CONSTRAINT pdf_cargas_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.usuarios (id);

ALTER TABLE ONLY public.pdf_cargas
  ADD CONSTRAINT pdf_cargas_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos (id);

ALTER TABLE ONLY public.pdf_eventos
  ADD CONSTRAINT pdf_eventos_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.usuarios (id);

ALTER TABLE ONLY public.pdf_eventos
  ADD CONSTRAINT pdf_eventos_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos (id);

ALTER TABLE ONLY public.pdf_objetos_pendientes
  ADD CONSTRAINT pdf_objetos_pendientes_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos (id);

ALTER TABLE ONLY public.pdf_retenciones_anulacion
  ADD CONSTRAINT pdf_retenciones_anulacion_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES
    public.documentos (id);

ALTER TABLE ONLY public.tipos_documentales
  ADD CONSTRAINT tipos_documentales_ambito_id_fkey FOREIGN KEY (ambito_id) REFERENCES public.ambitos_registro (id);

ALTER TABLE ONLY public.tipos_documentales
  ADD CONSTRAINT tipos_documentales_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios (id);

ALTER TABLE ONLY public.tipos_oficina
  ADD CONSTRAINT tipos_oficina_oficina_id_fkey FOREIGN KEY (oficina_id) REFERENCES public.oficinas (id);

ALTER TABLE ONLY public.tipos_oficina
  ADD CONSTRAINT tipos_oficina_tipo_id_fkey FOREIGN KEY (tipo_id) REFERENCES public.tipos_documentales (id)
    ON DELETE CASCADE;

ALTER TABLE ONLY public.tipos_relevo
  ADD CONSTRAINT tipos_relevo_destino_ambito_id_fkey FOREIGN KEY (destino_ambito_id) REFERENCES
    public.ambitos_registro (id);

ALTER TABLE ONLY public.tipos_relevo
  ADD CONSTRAINT tipos_relevo_origen_id_fkey FOREIGN KEY (origen_id) REFERENCES public.tipos_documentales (id);

ALTER TABLE ONLY public.tipos_relevo
  ADD CONSTRAINT tipos_relevo_tipo_id_fkey FOREIGN KEY (tipo_id) REFERENCES public.tipos_documentales (id);

ALTER TABLE ONLY public.ubicaciones_documento
  ADD CONSTRAINT ubicaciones_documento_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos (id);

ALTER TABLE ONLY public.ubicaciones_documento
  ADD CONSTRAINT ubicaciones_documento_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuarios (id);

ALTER TABLE ONLY public.ubicaciones_documento
  ADD CONSTRAINT ubicaciones_documento_unidad_id_fkey FOREIGN KEY (unidad_id) REFERENCES public.unidades_ubicacion (id);

ALTER TABLE ONLY public.unidades_ubicacion
  ADD CONSTRAINT unidades_ubicacion_padre_id_propietario_id_fkey FOREIGN KEY (padre_id, propietario_id)
    REFERENCES public.unidades_ubicacion (id, propietario_id);

ALTER TABLE ONLY public.unidades_ubicacion
  ADD CONSTRAINT unidades_ubicacion_propietario_id_oficina_id_fkey FOREIGN KEY (propietario_id, oficina_id)
    REFERENCES public.usuarios (id, oficina_id);

ALTER TABLE ONLY public.usuarios
  ADD CONSTRAINT usuarios_oficina_id_fkey FOREIGN KEY (oficina_id) REFERENCES public.oficinas (id);

ALTER TABLE ONLY public.usuarios
  ADD CONSTRAINT usuarios_rol_id_fkey FOREIGN KEY (rol_id) REFERENCES public.roles (id);

--
