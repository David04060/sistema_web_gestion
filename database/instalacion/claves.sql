-- Identifica cada fila y evita códigos, cuentas, vínculos y ubicaciones duplicados.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
ALTER TABLE ONLY public.ambitos_registro
  ADD CONSTRAINT ambitos_registro_id_clase_key UNIQUE (id, clase);

ALTER TABLE ONLY public.ambitos_registro
  ADD CONSTRAINT ambitos_registro_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ambitos_registro
  ADD CONSTRAINT ambitos_registro_titular_id_key UNIQUE (titular_id);

ALTER TABLE ONLY public.auditoria_configuracion
  ADD CONSTRAINT auditoria_configuracion_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.auditoria_documental
  ADD CONSTRAINT auditoria_documental_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.correlativos_documentales
  ADD CONSTRAINT correlativos_documentales_pkey PRIMARY KEY (ambito_id, tipo_id, anio);

ALTER TABLE ONLY public.delegaciones_documento
  ADD CONSTRAINT delegaciones_documento_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.documentos
  ADD CONSTRAINT documentos_ambito_id_codigo_visible_key UNIQUE (ambito_id, codigo_visible);

ALTER TABLE ONLY public.documentos
  ADD CONSTRAINT documentos_ambito_id_tipo_id_anio_correlativo_key UNIQUE (ambito_id, tipo_id, anio, correlativo);

ALTER TABLE ONLY public.documentos_oficina
  ADD CONSTRAINT documentos_oficina_pkey PRIMARY KEY (documento_id);

ALTER TABLE ONLY public.documentos_pdf
  ADD CONSTRAINT documentos_pdf_clave_r2_key UNIQUE (clave_r2);

ALTER TABLE ONLY public.documentos_pdf
  ADD CONSTRAINT documentos_pdf_pkey PRIMARY KEY (documento_id);

ALTER TABLE ONLY public.documentos_pdf
  ADD CONSTRAINT documentos_pdf_revision_key UNIQUE (revision);

ALTER TABLE ONLY public.documentos
  ADD CONSTRAINT documentos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.documentos_relaciones
  ADD CONSTRAINT documentos_relaciones_pkey PRIMARY KEY (documento_id);

ALTER TABLE ONLY public.miembros_ambito
  ADD CONSTRAINT miembros_ambito_ambito_id_usuario_id_key UNIQUE (ambito_id, usuario_id);

ALTER TABLE ONLY public.miembros_ambito
  ADD CONSTRAINT miembros_ambito_pkey PRIMARY KEY (usuario_id);

ALTER TABLE ONLY public.oficina_periodos
  ADD CONSTRAINT oficina_periodos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.oficinas
  ADD CONSTRAINT oficinas_nombre_key UNIQUE (nombre);

ALTER TABLE ONLY public.oficinas
  ADD CONSTRAINT oficinas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pdf_cargas
  ADD CONSTRAINT pdf_cargas_clave_definitiva_key UNIQUE (clave_definitiva);

ALTER TABLE ONLY public.pdf_cargas
  ADD CONSTRAINT pdf_cargas_clave_temporal_key UNIQUE (clave_temporal);

ALTER TABLE ONLY public.pdf_cargas
  ADD CONSTRAINT pdf_cargas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pdf_eventos
  ADD CONSTRAINT pdf_eventos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pdf_objetos_pendientes
  ADD CONSTRAINT pdf_objetos_pendientes_pkey PRIMARY KEY (clave_r2);

ALTER TABLE ONLY public.pdf_retenciones_anulacion
  ADD CONSTRAINT pdf_retenciones_anulacion_clave_r2_key UNIQUE (clave_r2);

ALTER TABLE ONLY public.pdf_retenciones_anulacion
  ADD CONSTRAINT pdf_retenciones_anulacion_pkey PRIMARY KEY (documento_id);

ALTER TABLE ONLY public.roles
  ADD CONSTRAINT roles_codigo_key UNIQUE (codigo);

ALTER TABLE ONLY public.roles
  ADD CONSTRAINT roles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tipos_documentales
  ADD CONSTRAINT tipos_documentales_ambito_id_nombre_key UNIQUE (ambito_id, nombre);

ALTER TABLE ONLY public.tipos_documentales
  ADD CONSTRAINT tipos_documentales_ambito_id_prefijo_key UNIQUE (ambito_id, prefijo);

ALTER TABLE ONLY public.tipos_documentales
  ADD CONSTRAINT tipos_documentales_id_ambito_id_key UNIQUE (id, ambito_id);

ALTER TABLE ONLY public.tipos_documentales
  ADD CONSTRAINT tipos_documentales_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tipos_oficina
  ADD CONSTRAINT tipos_oficina_pkey PRIMARY KEY (tipo_id);

ALTER TABLE ONLY public.tipos_relevo
  ADD CONSTRAINT tipos_relevo_pkey PRIMARY KEY (origen_id, destino_ambito_id);

ALTER TABLE ONLY public.ubicaciones_documento
  ADD CONSTRAINT ubicaciones_documento_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.unidades_ubicacion
  ADD CONSTRAINT unidades_ubicacion_id_propietario_id_key UNIQUE (id, propietario_id);

ALTER TABLE ONLY public.unidades_ubicacion
  ADD CONSTRAINT unidades_ubicacion_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.usuarios
  ADD CONSTRAINT usuarios_email_key UNIQUE (email);

ALTER TABLE ONLY public.usuarios
  ADD CONSTRAINT usuarios_id_oficina_id_key UNIQUE (id, oficina_id);

ALTER TABLE ONLY public.usuarios
  ADD CONSTRAINT usuarios_nombre_usuario_key UNIQUE (nombre_usuario);

ALTER TABLE ONLY public.usuarios
  ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);
