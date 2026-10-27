import type {PoolClient} from 'pg';
import type {Pagina} from './continuidad.schema.js';
/** Toda proyección documental aplica tipo ordinario antes de contar o paginar. */
const ordinario="NOT td.requiere_clave AND lower(btrim(td.nombre))<>'síseve'";
const nombre=(alias:string)=>`concat_ws(' ',${alias}.nombre,${alias}.apellido)`;
const relevoCampos=`r.id::text,r.archivo_id::text,a.nombre archivo,r.responsable_saliente_id::text,r.responsable_entrante_id::text,
 ${nombre('sal')} saliente,${nombre('ent')} entrante,${nombre('f')} formalizador,r.motivo,
 to_jsonb(r.fecha_formalizacion)#>>'{}' fecha_formalizacion,to_jsonb(r.fecha_aceptacion)#>>'{}' fecha_aceptacion`;
const relevoFrom=`FROM archivos_relevos r JOIN archivos_institucionales a ON a.id=r.archivo_id
 JOIN usuarios sal ON sal.id=r.responsable_saliente_id JOIN usuarios ent ON ent.id=r.responsable_entrante_id JOIN usuarios f ON f.id=r.formalizado_por_id`;
export async function relevo(c:PoolClient,id:string){return (await c.query(`SELECT ${relevoCampos} ${relevoFrom} WHERE r.id=$1`,[id])).rows[0];}
export async function relevos(c:PoolClient,p:Pagina){
 const total=(await c.query(`SELECT count(*)::int total ${relevoFrom}`)).rows[0].total;
 const relevos=(await c.query(`SELECT ${relevoCampos} ${relevoFrom} ORDER BY r.id DESC LIMIT $1 OFFSET $2`,[p.limite,(p.pagina-1)*p.limite])).rows;
 return {relevos,total,...p};
}
export async function pendientes(c:PoolClient,id:string,p:Pagina){
 const from=`FROM archivos_relevos r JOIN documentos_archivos da ON da.archivo_id=r.archivo_id
 JOIN documentos d ON d.id=da.documento_id JOIN tipos_documentales td ON td.id=d.tipo_documental_id
 WHERE r.id=$1 AND d.activo AND d.responsable_actual_id=r.responsable_saliente_id AND ${ordinario}
 AND NOT EXISTS(SELECT 1 FROM relevos_documentos rd WHERE rd.relevo_id=r.id AND rd.documento_id=d.id AND rd.hecho='ENTREGA')`;
 const total=(await c.query(`SELECT count(*)::int total ${from}`,[id])).rows[0].total;
 const originales=(await c.query(`SELECT d.id::text,d.codigo,d.asunto,d.archivador_id::text,public.fn_mp_original_libre(d.id) disponible ${from}
 ORDER BY d.id LIMIT $2 OFFSET $3`,[id,p.limite,(p.pagina-1)*p.limite])).rows;
 return {originales,total,...p};
}
export async function documento(c:PoolClient,id:string){return (await c.query(`SELECT d.id::text,d.responsable_actual_id::text,d.oficina_responsable_id::text,d.archivador_id::text,
 d.estado_tramite,da.archivo_id::text,public.fn_mp_original_libre(d.id) libre FROM documentos d
 JOIN tipos_documentales td ON td.id=d.tipo_documental_id LEFT JOIN documentos_archivos da ON da.documento_id=d.id
 WHERE d.id=$1 AND ${ordinario} AND d.activo`,[id])).rows[0];}
export async function movimiento(c:PoolClient,id:string){return (await c.query(`SELECT m.id::text,m.documento_id::text,m.usuario_origen_id::text,m.usuario_destino_id::text,
 m.oficina_origen_id::text,m.oficina_destino_id::text,m.estado,m.devolucion_confirmada_por_id::text
 FROM movimientos_documentales m JOIN documentos d ON d.id=m.documento_id JOIN tipos_documentales td ON td.id=d.tipo_documental_id
 WHERE m.id=$1 AND d.activo AND ${ordinario}`,[id])).rows[0];}
const sustitucionFrom=`FROM movimientos_sustituciones s JOIN movimientos_documentales m ON m.id=s.movimiento_id
 JOIN documentos d ON d.id=m.documento_id JOIN tipos_documentales td ON td.id=d.tipo_documental_id
 JOIN usuarios original ON original.id=s.usuario_original_id JOIN usuarios supl ON supl.id=s.sustituto_id
 JOIN usuarios aut ON aut.id=s.autorizado_por_id JOIN oficinas o ON o.id=s.oficina_intervencion_id`;
const sustitucionCampos=`s.id::text,s.movimiento_id::text,m.documento_id::text,d.codigo,m.estado estado_movimiento,(m.devolucion_confirmada_por_id IS NULL) recuperacion_pendiente,s.intervencion,s.usuario_original_id::text,s.sustituto_id::text,
 ${nombre('original')} participante_original,${nombre('supl')} sustituto,${nombre('aut')} autorizado_por,o.nombre oficina,s.oficina_intervencion_id::text,s.motivo,
 to_jsonb(s.fecha_autorizacion)#>>'{}' fecha_autorizacion,to_jsonb(s.fecha_fin)#>>'{}' fecha_fin,s.motivo_fin,
 (SELECT sa.operacion FROM sustituciones_actuaciones sa WHERE sa.sustitucion_id=s.id) operacion_real,
 (SELECT ${nombre('u')} FROM sustituciones_actuaciones sa JOIN usuarios u ON u.id=sa.actuado_por_id WHERE sa.sustitucion_id=s.id) ejecutante_real`;
export async function sustitucion(c:PoolClient,id:string){return (await c.query(`SELECT ${sustitucionCampos} ${sustitucionFrom} WHERE s.id=$1 AND ${ordinario}`,[id])).rows[0];}
export async function sustituciones(c:PoolClient,p:Pagina){
 const total=(await c.query(`SELECT count(*)::int total ${sustitucionFrom} WHERE ${ordinario}`)).rows[0].total;
 const sustituciones=(await c.query(`SELECT ${sustitucionCampos} ${sustitucionFrom} WHERE ${ordinario} ORDER BY s.id DESC LIMIT $1 OFFSET $2`,[p.limite,(p.pagina-1)*p.limite])).rows;
 return {sustituciones,total,...p};
}
export async function insertarEntrega(c:PoolClient,relevo:string,documento:string,actor:string,ubicacion:string|null,motivo:string){
 await c.query(`WITH t AS(SELECT clock_timestamp() fecha) INSERT INTO relevos_documentos(relevo_id,documento_id,hecho,registrado_por_id,fecha_registro,motivo,recibido_por_id,fecha_entrega,archivador_confirmado_id)
 SELECT $1,$2,'ENTREGA',$3,fecha,$5,$3,fecha,$4 FROM t`,[relevo,documento,actor,ubicacion,motivo]);
}
export async function finalizar(c:PoolClient,id:string,actor:string,motivo:string){await c.query(`UPDATE movimientos_sustituciones SET fecha_fin=clock_timestamp(),finalizado_por_id=$2,motivo_fin=$3 WHERE id=$1`,[id,actor,motivo]);}
