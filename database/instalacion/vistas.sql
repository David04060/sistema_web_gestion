-- Presenta documentos ordinarios o anulados. Estas vistas no sustituyen los permisos de cada cuenta.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
CREATE VIEW public.documentos_anulados AS
SELECT
  id,
  ambito_id,
  tipo_id,
  tipo_nombre_guardado,
  registrado_por,
  clasificacion,
  asunto,
  remitente,
  observaciones,
  anio,
  correlativo,
  prefijo_guardado,
  codigo_visible,
  situacion,
  situacion_antes_anulacion,
  creado_en,
  actualizado_en,
  revision
FROM
  public.documentos
WHERE (situacion = 'ANULADO'::text);

CREATE VIEW public.documentos_ordinarios AS
SELECT
  id,
  ambito_id,
  tipo_id,
  tipo_nombre_guardado,
  registrado_por,
  clasificacion,
  asunto,
  remitente,
  observaciones,
  anio,
  correlativo,
  prefijo_guardado,
  codigo_visible,
  situacion,
  situacion_antes_anulacion,
  creado_en,
  actualizado_en,
  revision
FROM
  public.documentos
WHERE (situacion <> 'ANULADO'::text);
