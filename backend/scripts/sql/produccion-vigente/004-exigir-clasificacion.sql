-- Activar únicamente con backend y frontend nuevos verificados en producción.
DROP TRIGGER aa_documentos_clasificacion_registro ON documentos;
CREATE TRIGGER aa_documentos_clasificacion_registro BEFORE INSERT OR UPDATE OF clasificacion_registro
 ON documentos FOR EACH ROW EXECUTE FUNCTION fn_documentos_clasificacion_registro();
