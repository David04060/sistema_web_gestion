import type {Pool,PoolClient} from 'pg';
import {env} from '../../config/env.js';
/** Unifica hechos existentes, sin inventar ingresos o decisiones históricas. El servicio autoriza antes del conteo. */
export async function recorrido(c:Pool|PoolClient,id:string,pagina:number,limite:number){
 const partes=[`SELECT 'registro-'||d.id id,'REGISTRO' tipo,d.fecha_creacion fecha,concat_ws(' ',u.nombre,u.apellido) responsable,'Registro del original con código '||d.codigo descripcion
 FROM documentos d JOIN usuarios u ON u.id=d.registrado_por_id WHERE d.id=$1`,
 `SELECT 'historia-'||h.id,CASE WHEN h.campos_modificados?'destinatario_autorizado_id' THEN 'DECISION'
 WHEN h.campos_modificados->'estado_tramite'->>'despues'='PENDIENTE_DECISION' THEN 'SOLICITUD_DECISION' ELSE 'CORRECCION' END,
 h.fecha,concat_ws(' ',u.nombre,u.apellido),coalesce(h.campos_modificados->'_evento_documental'->>'motivo','Actualización auditada del original')
 FROM historial_modificaciones h LEFT JOIN usuarios u ON u.id=h.usuario_actor_id
 WHERE h.tabla='documentos' AND h.registro_id=$1 AND h.accion<>'CREAR' AND
 (h.campos_modificados ?| ARRAY['asunto','remitente','observaciones','destinatario_autorizado_id'] OR h.campos_modificados->'estado_tramite'->>'despues'='PENDIENTE_DECISION')`,
 ...[['SALIDA','fecha_salida','trasladado_por_id',"'Salida física hacia '||concat_ws(' ',dest.nombre,dest.apellido)"],['RECEPCION','fecha_recepcion','recibido_por_id',"'Recepción física confirmada'"],['RECHAZO','fecha_rechazo','rechazado_por_id',"m.motivo_rechazo"],['RECUPERACION','fecha_confirmacion_devolucion','devolucion_confirmada_por_id',"'Recuperación física confirmada en origen'"],['CANCELACION','fecha_cancelacion','cancelado_por_id',"m.motivo_cancelacion"]].map(([tipo,fecha,actor,descripcion])=>`SELECT '${tipo.toLowerCase()}-'||m.id,'${tipo}',m.${fecha},concat_ws(' ',u.nombre,u.apellido),${descripcion}
 FROM movimientos_documentales m JOIN usuarios u ON u.id=m.${actor} JOIN usuarios dest ON dest.id=m.usuario_destino_id WHERE m.documento_id=$1 AND m.${fecha} IS NOT NULL`)];
 if(env.PRIMER_INGRESO_ORDINARIO_HABILITADO)partes.push(`SELECT 'ingreso-'||i.id,'INGRESO',i.fecha_ingreso,concat_ws(' ',u.nombre,u.apellido),i.proposito FROM ingresos_mesa_partes i JOIN usuarios u ON u.id=i.registrado_por_id WHERE i.documento_id=$1`);
 if(env.CICLO_INGRESOS_ORDINARIOS_HABILITADO)partes.push(
 `SELECT 'actuacion-'||a.id,a.tipo,a.fecha_actuacion,concat_ws(' ',u.nombre,u.apellido),a.descripcion FROM ingresos_actuaciones a JOIN ingresos_mesa_partes i ON i.id=a.ingreso_id JOIN usuarios u ON u.id=a.registrado_por_id WHERE i.documento_id=$1`,
 `SELECT 'conclusion-'||i.id,'CONCLUSION',i.fecha_conclusion,concat_ws(' ',u.nombre,u.apellido),i.motivo_conclusion||' · Resultado: '||i.resultado FROM ingresos_mesa_partes i JOIN usuarios u ON u.id=i.concluido_por_id WHERE i.documento_id=$1 AND i.fecha_conclusion IS NOT NULL`,
 `SELECT 'invalidacion-'||i.id,'INVALIDACION',i.fecha_invalidacion,concat_ws(' ',u.nombre,u.apellido),i.motivo_invalidacion FROM ingresos_mesa_partes i JOIN usuarios u ON u.id=i.invalidado_por_id WHERE i.documento_id=$1 AND i.fecha_invalidacion IS NOT NULL`);
 if(env.RELEVOS_HABILITADOS)partes.push(`SELECT 'relevo-'||rd.id,'RELEVO',rd.fecha_entrega,concat_ws(' ',u.nombre,u.apellido),rd.motivo FROM relevos_documentos rd JOIN usuarios u ON u.id=rd.recibido_por_id WHERE rd.documento_id=$1 AND rd.hecho='ENTREGA'`);
 if(env.SUSTITUCIONES_HABILITADAS)partes.push(`SELECT 'designacion-'||s.id,'AUTORIZACION_SUSTITUCION',s.fecha_autorizacion,concat_ws(' ',u.nombre,u.apellido),s.motivo FROM movimientos_sustituciones s JOIN movimientos_documentales m ON m.id=s.movimiento_id JOIN usuarios u ON u.id=s.autorizado_por_id WHERE m.documento_id=$1`,
 `SELECT 'sustitucion-'||a.id,'SUSTITUCION',a.fecha_actuacion,concat_ws(' ',u.nombre,u.apellido),a.operacion||' · '||a.motivo FROM sustituciones_actuaciones a JOIN movimientos_sustituciones s ON s.id=a.sustitucion_id JOIN movimientos_documentales m ON m.id=s.movimiento_id JOIN usuarios u ON u.id=a.actuado_por_id WHERE m.documento_id=$1`);
 return (await c.query(`WITH hechos AS(${partes.join(' UNION ALL ')}) SELECT (SELECT count(*)::int FROM hechos) total,
 coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM(SELECT id,tipo,to_jsonb(fecha)#>>'{}' fecha,responsable,descripcion FROM hechos ORDER BY fecha,id LIMIT $2 OFFSET $3)p),'[]'::jsonb) hechos`,[id,limite,(pagina-1)*limite])).rows[0];
}
