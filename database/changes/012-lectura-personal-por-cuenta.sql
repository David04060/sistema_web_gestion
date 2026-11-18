BEGIN;

-- La lectura ordinaria incluye los documentos propios y el archivo de la oficina
-- cuyo periodo vigente corresponde al reemplazante. La migración 011 añade las delegaciones.
CREATE OR REPLACE FUNCTION public.documento_consultable(actor bigint, doc bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.documentos d
   JOIN public.usuarios u ON u.id=actor AND u.activo
   LEFT JOIN public.miembros_ambito m ON m.usuario_id=u.id
   WHERE d.id=doc AND (u.rol_id=1 OR (
     d.situacion<>'ANULADO' AND (
       (u.rol_id IN (3,4) AND u.oficina_id IS NOT NULL) OR
       (u.rol_id=5 AND (
         (d.registrado_por=u.id AND d.ambito_id=m.ambito_id) OR EXISTS (
           SELECT 1 FROM public.documentos_oficina archivo
           JOIN public.oficina_periodos anterior ON anterior.id=archivo.periodo_id
           JOIN public.oficina_periodos vigente ON vigente.oficina_id=anterior.oficina_id
           WHERE archivo.documento_id=d.id AND anterior.usuario_id=d.registrado_por
             AND anterior.fin IS NOT NULL AND vigente.fin IS NULL
             AND vigente.usuario_id=u.id AND vigente.oficina_id=u.oficina_id
         )
       ))
     )
   ))
 )
$$;

COMMIT;
