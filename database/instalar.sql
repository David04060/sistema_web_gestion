-- Instala la estructura vigente exclusivamente en una base PostgreSQL 18 vacía.
-- psql resuelve cada archivo con relación a este instalador; un error revierte toda la instalación.
\set ON_ERROR_STOP on
BEGIN;
-- Prepara la sesión y define las reglas que usarán las tablas al operar.
\ir instalacion/sesion.sql
\ir instalacion/funciones/aplicar_delegacion.sql
\ir instalacion/funciones/aplicar_ubicacion.sql
\ir instalacion/funciones/asignar_codigo_documental.sql
\ir instalacion/funciones/auditar_documento.sql
\ir instalacion/funciones/auditar_pdf.sql
\ir instalacion/funciones/documento_consultable.sql
\ir instalacion/funciones/documento_consultable_con_delegacion.sql
\ir instalacion/funciones/documento_delegado_por.sql
\ir instalacion/funciones/documento_periodo_cerrado.sql
\ir instalacion/funciones/documento_tiene_relacion_consultable.sql
\ir instalacion/funciones/documento_tiene_relacion_visible.sql
\ir instalacion/funciones/documentos_grupo.sql
\ir instalacion/funciones/es_finalizacion_retencion.sql
\ir instalacion/funciones/exigir_oficina_autor.sql
\ir instalacion/funciones/finalizar_retencion_pdf.sql
\ir instalacion/funciones/impedir_borrado_documento.sql
\ir instalacion/funciones/impedir_cambio_historico.sql
\ir instalacion/funciones/impedir_truncado.sql
\ir instalacion/funciones/programar_retencion_pdf_anulado.sql
\ir instalacion/funciones/proteger_anulacion_decidida_por_direccion.sql
\ir instalacion/funciones/proteger_documento_historico.sql
\ir instalacion/funciones/registrar_oficina_documento.sql
\ir instalacion/funciones/registrar_oficina_tipo.sql
\ir instalacion/funciones/sincronizar_periodo_oficina.sql
\ir instalacion/funciones/validar_delegacion.sql
\ir instalacion/funciones/validar_documento_actualizacion.sql
\ir instalacion/funciones/validar_estado_final.sql
\ir instalacion/funciones/validar_mapeo_tipo_relevo.sql
\ir instalacion/funciones/validar_miembro_ambito.sql
\ir instalacion/funciones/validar_pdf_permiso.sql
\ir instalacion/funciones/validar_relacion.sql
\ir instalacion/funciones/validar_tipo_documental.sql
\ir instalacion/funciones/validar_ubicacion.sql
\ir instalacion/funciones/validar_unidad_ubicacion.sql
\ir instalacion/funciones/validar_usuario_oficina.sql
-- Crea datos y numeración automática antes de conectar sus restricciones y disparadores.
\ir instalacion/tablas/identidad.sql
\ir instalacion/tablas/documentos.sql
\ir instalacion/tablas/ubicaciones.sql
\ir instalacion/tablas/relevo.sql
\ir instalacion/tablas/pdf.sql
\ir instalacion/tablas/auditoria.sql
-- Completa consultas guardadas, claves, búsquedas y reglas entre tablas.
\ir instalacion/vistas.sql
\ir instalacion/claves.sql
\ir instalacion/indices.sql
\ir instalacion/triggers.sql
\ir instalacion/relaciones.sql
\ir instalacion/atencion.sql
-- Inserta solo catálogos mínimos. Las cuentas se preparan por separado.
\ir instalacion/catalogos.sql
COMMIT;
