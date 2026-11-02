import {fechaRegistro,periodoRegistro} from './fecha-registro.js';
import {z} from 'zod';
import {datosAuditoria} from './auditoria.documental.js';
import {operacion,documento,exigirAmbito,exigirRevision,lecturaSQL,permisos} from '../../shared/documental/nucleo.js';
import {HttpError} from '../../shared/http/HttpError.js';
import {idSchema} from '../../shared/admin/admin.schema.js';
export const id=idSchema;
const texto=z.string().trim().max(20000).nullable().optional().default(null);
const motivo=z.string().trim().min(1).max(1000);
export const alta=z.object({tipo_id:id,clasificacion:z.enum(['RECIBIDO','EMITIDO']),asunto:z.string().trim().min(1).max(20000),remitente:texto,observaciones:texto,conservar_en_mesa:z.boolean().optional().default(false),unidad_id:id.nullable().optional(),origen_id:id.optional(),valores:z.array(z.object({campo_id:id,valor:z.string().max(20000)}).strict()).max(100).optional().default([])}).strict();
export const correccion=z.object({revision:id,motivo,asunto:z.string().trim().min(1).max(20000),remitente:texto,observaciones:texto,valores:z.array(z.object({campo_id:id,valor:z.string().max(20000)}).strict()).max(100).optional()}).strict();
export const delegacion=z.object({revision:id,oficina_id:id.nullable().optional().default(null),usuario_id:id.nullable().optional().default(null),nombre:z.string().trim().min(1).max(250).nullable().optional().default(null),observaciones:texto}).strict().superRefine((v,c)=>{if((!v.usuario_id&&!v.nombre)||(v.usuario_id&&v.nombre)||(v.oficina_id&&!v.usuario_id))c.addIssue({code:'custom',message:'Seleccione una persona registrada o escriba su nombre; oficina sola no basta'});});
export const ubicacion=z.object({revision:id,unidad_id:id}).strict();
export const anulacion=z.object({revision:id,motivo}).strict();
export const filtros=z.object({q:z.string().trim().max(250).default(''),fecha:fechaRegistro.optional(),situacion:z.enum(['PENDIENTE_DIRECCION','EN_MESA_DE_PARTES','GUARDADO_DIRECCION','PERSONAL','DELEGADO','ANULADO']).optional(),tipo_id:id.optional(),clasificacion:z.enum(['RECIBIDO','EMITIDO']).optional(),pagina:z.coerce.number().int().min(1).max(100000).default(1),limite:z.coerce.number().int().min(1).max(100).default(20)}).strict();
export async function opciones(actor:string){return operacion(actor,'Opciones documentales',async(c,a)=>{const ambito=exigirAmbito(a);return {ambito_id:ambito,tipos:(await c.query('SELECT id::text,nombre,prefijo FROM tipos_documentales WHERE ambito_id=$1 AND activo ORDER BY nombre',[ambito])).rows,campos:(await c.query('SELECT id::text,nombre_actual FROM campos_opcionales WHERE usuario_id=$1 ORDER BY id',[a.id])).rows,unidades:(await c.query('SELECT id::text,clase,nombre,padre_id::text FROM unidades_ubicacion WHERE propietario_id=$1 AND activo ORDER BY id',[a.id])).rows,destinatarios:(await c.query("SELECT id::text,concat_ws(' ',nombre,apellido) nombre,oficina_id::text FROM usuarios WHERE activo ORDER BY nombre,apellido")).rows,oficinas:(await c.query('SELECT id::text,nombre FROM oficinas WHERE activa ORDER BY nombre')).rows};});}
export async function listar(actor:string,f:z.infer<typeof filtros>){return operacion(actor,'Consulta',async(c,a)=>{
 if(f.situacion==='ANULADO'&&a.rol_id!==1)throw new HttpError(403,'Solo Superadministrador consulta anulados');
 const periodo=periodoRegistro(f.fecha);
 const valores=[a.id,a.rol_id,a.ambito_id,'%'+f.q.replace(/[\\%_]/g,'\\$&')+'%',f.situacion??null,f.tipo_id??null,f.clasificacion??null,f.limite,(f.pagina-1)*f.limite,periodo.inicio,periodo.intervalo];
 const base=`FROM documentos d WHERE ${lecturaSQL} AND ($2::smallint<>1 OR $5::text IS NOT NULL OR d.situacion<>'ANULADO') AND concat_ws(' ',d.codigo_visible,d.asunto,d.remitente) ILIKE $4 ESCAPE E'\\\\' AND ($5::text IS NULL OR d.situacion=$5) AND ($6::bigint IS NULL OR d.tipo_id=$6) AND ($7::text IS NULL OR d.clasificacion=$7) AND ($10::date IS NULL OR (d.creado_en>=($10::date::timestamp AT TIME ZONE 'America/Lima') AND d.creado_en<(($10::date+$11::interval) AT TIME ZONE 'America/Lima')))`;
 const r=await c.query(`WITH visibles AS (SELECT to_jsonb(d)||jsonb_build_object('id',d.id::text,'ambito_id',d.ambito_id::text,'tipo_id',d.tipo_id::text,'registrado_por',d.registrado_por::text,'ubicacion_ruta',(SELECT l.ruta_ubicacion_guardada FROM ubicaciones_documento l WHERE l.documento_id=d.id AND l.vigente),'revision',d.revision::text,'registrado_por_oficina',(SELECT o.nombre FROM usuarios u LEFT JOIN oficinas o ON o.id=u.oficina_id WHERE u.id=d.registrado_por),'registrado_por_nombre',(SELECT concat_ws(' ',u.nombre,u.apellido) FROM usuarios u WHERE u.id=d.registrado_por)) fila,d.id orden,d.creado_en ${base}) SELECT (SELECT count(*)::int FROM visibles) total,coalesce((SELECT jsonb_agg(v.fila) FROM (SELECT fila FROM visibles ORDER BY creado_en DESC,orden DESC LIMIT $8 OFFSET $9) v),'[]'::jsonb) documentos`,valores);return {...r.rows[0],pagina:f.pagina,limite:f.limite};
});}
export async function detalle(actor:string,documentoId:string){return operacion(actor,'Consulta',async(c,a)=>{
 const d=await documento(c,a,documentoId);
 const valores=(await c.query('SELECT campo_id::text,nombre_guardado,valor FROM valores_documento WHERE documento_id=$1 ORDER BY campo_id',[documentoId])).rows;
 const destino=(await c.query("SELECT e.*,e.usuario_indicado_id::text,e.oficina_indicada_id::text,concat_ws(' ',u.nombre,u.apellido) actor FROM delegaciones_documento e JOIN usuarios u ON u.id=e.delegado_por WHERE documento_id=$1",[documentoId])).rows[0]??null;
 const lugar=(await c.query('SELECT unidad_id::text,oficina_nombre_guardado,ruta_ubicacion_guardada,registrado_en FROM ubicaciones_documento WHERE documento_id=$1 AND vigente',[documentoId])).rows[0]??null;
 const relacionados=(await c.query(`SELECT d.id::text,d.codigo_visible,d.asunto,r.origen_id::text FROM documentos_relaciones r JOIN documentos d ON (r.documento_id=$1 AND d.id=r.origen_id) OR (r.origen_id=$1 AND d.id=r.documento_id) WHERE ${lecturaSQL}`,[documentoId,a.rol_id,a.ambito_id])).rows;
 return {documento:{...d,valores,delegacion:destino,ubicacion:lugar,relacionados,permisos:permisos(a,d)}};
});}
export async function historial(actor:string,documentoId:string){return operacion(actor,'Consulta',async(c,a)=>{await documento(c,a,documentoId);return {historial:(await c.query("SELECT h.id::text,h.accion,h.motivo,h.anterior,h.posterior,h.fecha,h.actor_id::text,concat_ws(' ',u.nombre,u.apellido) actor FROM auditoria_documental h JOIN usuarios u ON u.id=h.actor_id WHERE documento_id=$1 ORDER BY h.fecha,h.id",[documentoId])).rows};});}
export async function registrar(actor:string,v:z.infer<typeof alta>){const nuevo=await operacion(actor,'Registro',async(c,a)=>{
 const ambito=exigirAmbito(a);if(v.conservar_en_mesa&&a.rol_id!==4)throw new HttpError(403,'Solo Secretaría conserva en Mesa de Partes');
 if(v.origen_id){const origen=await documento(c,a,v.origen_id,true);if(origen.ambito_id!==ambito)throw new HttpError(403,'Origen fuera de su ámbito');}
 const situacion=a.rol_id===5?'PERSONAL':a.rol_id===4&&v.conservar_en_mesa?'EN_MESA_DE_PARTES':'PENDIENTE_DIRECCION';
 const d=(await c.query(`INSERT INTO documentos(ambito_id,tipo_id,registrado_por,clasificacion,asunto,remitente,observaciones,situacion) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id::text`,[ambito,v.tipo_id,a.id,v.clasificacion,v.asunto,v.remitente,v.observaciones,situacion])).rows[0];
 for(const campo of v.valores){const etiqueta=(await c.query('SELECT nombre_actual FROM campos_opcionales WHERE id=$1 AND usuario_id=$2 FOR SHARE',[campo.campo_id,a.id])).rows[0];if(!etiqueta)throw new HttpError(400,'Campo opcional ajeno');await c.query('INSERT INTO valores_documento(documento_id,campo_id,nombre_guardado,valor) VALUES($1,$2,$3,$4)',[d.id,campo.campo_id,etiqueta.nombre_actual,campo.valor]);}
 if(v.origen_id)await c.query('INSERT INTO documentos_relaciones(documento_id,origen_id,creado_por) VALUES($1,$2,$3)',[d.id,v.origen_id,a.id]);
 if(v.unidad_id)await c.query("INSERT INTO ubicaciones_documento(documento_id,unidad_id,registrado_por,oficina_nombre_guardado,ruta_ubicacion_guardada) VALUES($1,$2,$3,'','')",[d.id,v.unidad_id,a.id]);
 return d.id as string;
 });return detalle(actor,nuevo);}
export async function corregir(actor:string,documentoId:string,v:z.infer<typeof correccion>){await operacion(actor,v.motivo,async(c,a)=>{
 const d=await documento(c,a,documentoId,true);if(!permisos(a,d).corregir)throw new HttpError(403,'Corrección no autorizada');exigirRevision(d,v.revision);
 await c.query('UPDATE documentos SET asunto=$2,remitente=$3,observaciones=$4 WHERE id=$1',[documentoId,v.asunto,v.remitente,v.observaciones]);
 for(const campo of v.valores??[]){const r=await c.query('UPDATE valores_documento SET valor=$3 WHERE documento_id=$1 AND campo_id=$2',[documentoId,campo.campo_id,campo.valor]);if(!r.rowCount)throw new HttpError(400,'Campo histórico inexistente');}
 });return detalle(actor,documentoId);}
export async function delegar(actor:string,documentoId:string,v:z.infer<typeof delegacion>){await operacion(actor,'Delegación indicada',async(c,a)=>{
 const d=await documento(c,a,documentoId,true);exigirRevision(d,v.revision);if(!permisos(a,d).delegar)throw new HttpError(403,'Delegación no autorizada');
 let nombre=v.nombre;if(v.usuario_id){const u=(await c.query("SELECT oficina_id::text,concat(nombre,' ',apellido) nombre FROM usuarios WHERE id=$1 AND activo FOR SHARE",[v.usuario_id])).rows[0];if(!u||v.oficina_id&&u.oficina_id!==v.oficina_id)throw new HttpError(400,'Persona y oficina incompatibles');nombre=u.nombre;}
 await c.query('INSERT INTO delegaciones_documento(documento_id,oficina_indicada_id,usuario_indicado_id,nombre_persona_guardado,observaciones,delegado_por) VALUES($1,$2,$3,$4,$5,$6)',[documentoId,v.oficina_id,v.usuario_id,nombre,v.observaciones,a.id]);
 });return detalle(actor,documentoId);}
export async function ubicar(actor:string,documentoId:string,v:z.infer<typeof ubicacion>){await operacion(actor,'Ubicación',async(c,a)=>{const d=await documento(c,a,documentoId,true);if(!permisos(a,d).ubicar)throw new HttpError(403,'Ubicación no autorizada');exigirRevision(d,v.revision);await c.query('UPDATE ubicaciones_documento SET vigente=false WHERE documento_id=$1 AND vigente',[documentoId]);await c.query("INSERT INTO ubicaciones_documento(documento_id,unidad_id,registrado_por,oficina_nombre_guardado,ruta_ubicacion_guardada) VALUES($1,$2,$3,'','')",[documentoId,v.unidad_id,a.id]);});return detalle(actor,documentoId);}
export async function anular(actor:string,documentoId:string,v:z.infer<typeof anulacion>){await operacion(actor,v.motivo,async(c,a)=>{const d=await documento(c,a,documentoId,true);if(!permisos(a,d).anular)throw new HttpError(403,'Anulación no autorizada');exigirRevision(d,v.revision);await c.query("UPDATE documentos SET situacion_antes_anulacion=situacion,situacion='ANULADO' WHERE id=$1",[documentoId]);});return {anulado:true};}
export async function auditoria(actor:string,documentoId:string){return operacion(actor,'Auditoría documental',async(c,a)=>{
 await documento(c,a,documentoId);
 const filas=(await c.query(`SELECT 'doc:'||h.id::text id,h.accion,h.motivo,h.anterior,h.posterior,h.fecha,concat_ws(' ',u.nombre,u.apellido) actor FROM auditoria_documental h JOIN usuarios u ON u.id=h.actor_id WHERE h.documento_id=$1
 UNION ALL SELECT 'pdf:'||p.id::text,'PDF_'||p.accion,NULL,NULL,NULL,p.fecha,CASE WHEN u.id IS NULL THEN NULL ELSE concat_ws(' ',u.nombre,u.apellido) END FROM pdf_eventos p LEFT JOIN usuarios u ON u.id=p.actor_id WHERE p.documento_id=$1 AND p.accion IN ('LIMPIEZA_PENDIENTE','LIMPIEZA_COMPLETADA') ORDER BY fecha,id`,[documentoId])).rows;
 return {eventos:filas.map(h=>({id:h.id,accion:h.accion,actor:h.actor,fecha:h.fecha,motivo:h.motivo,datos:datosAuditoria(h.anterior,h.posterior)}))};
});}
