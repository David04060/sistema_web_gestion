-- Retirada autorizada de campos opcionales. No modifica permisos documentales/PDF.
-- No usar CASCADE: cualquier dependencia no inventariada debe detener la migración.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('documental-configuracion'));
LOCK TABLE public.auditoria_configuracion IN ACCESS EXCLUSIVE MODE;

-- Mantener la protección de TODOS los demás eventos incluso dentro de esta transacción.
-- La excepción es exclusiva de DELETE/CAMPO_OPCIONAL y desaparece antes de COMMIT.
CREATE FUNCTION public.retirar_auditoria_campo_opcional_014() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.entidad = 'CAMPO_OPCIONAL' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Registro histórico inmutable';
END $$;
DROP TRIGGER proteger_auditoria_configuracion ON public.auditoria_configuracion;
CREATE TRIGGER proteger_auditoria_configuracion BEFORE DELETE OR UPDATE
ON public.auditoria_configuracion FOR EACH ROW
EXECUTE FUNCTION public.retirar_auditoria_campo_opcional_014();
DELETE FROM public.auditoria_configuracion WHERE entidad = 'CAMPO_OPCIONAL';
DROP TRIGGER proteger_auditoria_configuracion ON public.auditoria_configuracion;
CREATE TRIGGER proteger_auditoria_configuracion BEFORE DELETE OR UPDATE
ON public.auditoria_configuracion FOR EACH ROW
EXECUTE FUNCTION public.impedir_cambio_historico();
DROP FUNCTION public.retirar_auditoria_campo_opcional_014();

DROP TABLE public.valores_documento;
DROP TABLE public.cambios_nombre_campo;
DROP TABLE public.campos_opcionales;
DROP FUNCTION public.validar_valor_documento();
DROP FUNCTION public.auditar_valor_documento();
DROP FUNCTION public.registrar_cambio_nombre_campo();

-- Ambos índices deben ser equivalentes y ninguno puede respaldar una restricción.
DO $$
DECLARE original pg_index%ROWTYPE; duplicado pg_index%ROWTYPE;
BEGIN
  SELECT * INTO STRICT original FROM pg_index WHERE indexrelid='public.documentos_relaciones_origen'::regclass;
  SELECT * INTO STRICT duplicado FROM pg_index WHERE indexrelid='public.ix_documentos_relaciones_origen'::regclass;
  IF (original.indrelid,original.indisunique,original.indnkeyatts,original.indnatts,
      original.indkey,original.indclass,original.indcollation,original.indoption,
      original.indexprs::text,original.indpred::text)
    IS DISTINCT FROM
     (duplicado.indrelid,duplicado.indisunique,duplicado.indnkeyatts,duplicado.indnatts,
      duplicado.indkey,duplicado.indclass,duplicado.indcollation,duplicado.indoption,
      duplicado.indexprs::text,duplicado.indpred::text)
    OR NOT (original.indisvalid AND original.indisready AND duplicado.indisvalid AND duplicado.indisready)
    OR EXISTS (SELECT 1 FROM pg_constraint WHERE conindid IN (original.indexrelid,duplicado.indexrelid))
    OR (SELECT relam FROM pg_class WHERE oid=original.indexrelid) IS DISTINCT FROM
       (SELECT relam FROM pg_class WHERE oid=duplicado.indexrelid) THEN
    RAISE EXCEPTION 'Los índices de origen no son duplicados independientes';
  END IF;
END $$;
DROP INDEX public.ix_documentos_relaciones_origen;
COMMIT;
