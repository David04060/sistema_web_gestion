-- Facilita las búsquedas y garantiza un único responsable activo y una única ubicación vigente.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE INDEX documentos_oficina_periodo ON public.documentos_oficina USING btree (periodo_id);

CREATE INDEX documentos_relaciones_origen ON public.documentos_relaciones USING btree (origen_id);

CREATE INDEX ix_auditoria_documento_fecha ON public.auditoria_documental USING btree (documento_id, fecha, id);

CREATE INDEX ix_documentos_ambito_situacion_fecha ON public.documentos USING btree (ambito_id, situacion,
  creado_en DESC);

CREATE INDEX ix_documentos_autor_fecha ON public.documentos USING btree (registrado_por, creado_en DESC);

CREATE UNIQUE INDEX oficina_periodo_abierto ON public.oficina_periodos USING btree (oficina_id)
WHERE (fin IS NULL);

CREATE INDEX oficina_periodos_usuario ON public.oficina_periodos USING btree (usuario_id, oficina_id);

CREATE INDEX pdf_retenciones_pendientes ON public.pdf_retenciones_anulacion USING btree (vence_en, reintentar_desde)
WHERE (eliminado_en IS NULL);

CREATE UNIQUE INDEX usuario_periodo_abierto ON public.oficina_periodos USING btree (usuario_id)
WHERE (fin IS NULL);

CREATE UNIQUE INDEX usuarios_oficina_activa_unica ON public.usuarios USING btree (oficina_id)
WHERE (activo AND (oficina_id IS NOT NULL));

CREATE UNIQUE INDEX ux_ambito_compartido ON public.ambitos_registro USING btree (clase)
WHERE (clase = 'COMPARTIDO_DIRECCION'::text);

CREATE UNIQUE INDEX ux_superadministrador_unico ON public.usuarios USING btree (rol_id)
WHERE (rol_id = 1);

CREATE UNIQUE INDEX ux_ubicacion_hija_nombre ON public.unidades_ubicacion USING btree (propietario_id,
  padre_id, lower(clase), lower(nombre))
WHERE (padre_id IS NOT NULL);

CREATE UNIQUE INDEX ux_ubicacion_raiz_nombre ON public.unidades_ubicacion USING btree (propietario_id,
  lower(clase), lower(nombre))
WHERE (padre_id IS NULL);

CREATE UNIQUE INDEX ux_ubicacion_vigente ON public.ubicaciones_documento USING btree (documento_id)
WHERE
  vigente;

-- Búsqueda acumulativa de participantes y recorrido cronológico.
CREATE INDEX delegaciones_documento_recorrido ON public.delegaciones_documento(documento_id,delegado_en,id);
CREATE INDEX delegaciones_documento_destinatario ON public.delegaciones_documento(usuario_indicado_id,documento_id);
