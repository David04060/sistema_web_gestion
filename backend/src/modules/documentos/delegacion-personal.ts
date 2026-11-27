import type {PoolClient} from 'pg';
import {z} from 'zod';
import {idSchema} from '../../shared/admin/admin.schema.js';
import type {ActorDocumental} from '../../shared/documental/transaccion.js';
import {clienteDocumental,conexionDocumental} from '../../shared/documental/contexto.js';
import {HttpError} from '../../shared/http/HttpError.js';

const texto=z.string().trim().min(1).max(250).nullable().optional().default(null);
export const delegacionPersonalSchema=z.object({oficina_id:idSchema.nullable().optional().default(null),usuario_id:idSchema.nullable().optional().default(null),nombre:texto,destino_manual:texto}).strict().superRefine((d,c)=>{
 if(!d.oficina_id&&!d.usuario_id&&!d.nombre&&!d.destino_manual)c.addIssue({code:'custom',message:'Indique al menos un destinatario'});
 if(d.oficina_id&&d.destino_manual)c.addIssue({code:'custom',message:'Seleccione una oficina o escriba un destino'});
 if(d.usuario_id&&d.nombre)c.addIssue({code:'custom',message:'Seleccione un usuario o escriba una persona'});
 if(d.usuario_id&&d.destino_manual)c.addIssue({code:'custom',message:'Un usuario registrado requiere un destino del catálogo'});
});

/** El llamador bloquea el documento y comparte esta transacción con el registro inicial. */
export async function registrarDelegacionPersonal(c:PoolClient,actor:ActorDocumental,id:string,datos:z.infer<typeof delegacionPersonalSchema>){
 if(clienteDocumental()||actor.rol!=='Usuario')throw new HttpError(403,'Solo el usuario autor registra su delegación personal');
 const d=(await c.query('SELECT registrado_por_id::text,activo FROM documentos WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!d||d.registrado_por_id!==actor.id)throw new HttpError(404,'Documento inexistente o no autorizado');
 if(!d.activo)throw new HttpError(409,'El documento está anulado');
 if((await c.query('SELECT 1 FROM delegaciones_personales WHERE documento_id=$1',[id])).rowCount)throw new HttpError(409,'La delegación ya fue registrada');
 let oficina=datos.destino_manual,persona=datos.nombre;
 if(datos.oficina_id){const o=(await c.query('SELECT nombre FROM oficinas WHERE id=$1 FOR SHARE',[datos.oficina_id])).rows[0];if(!o)throw new HttpError(400,'Oficina inexistente');oficina=o.nombre;}
 if(datos.usuario_id){const u=(await c.query("SELECT oficina_id::text,concat_ws(' ',nombre,apellido) nombre FROM usuarios WHERE id=$1 AND activo FOR SHARE",[datos.usuario_id])).rows[0];if(!u||(datos.oficina_id&&u.oficina_id!==datos.oficina_id))throw new HttpError(400,'Oficina y usuario incompatibles');persona=u.nombre;}
 const destinatario=[oficina,persona].filter(Boolean).join(' · ');
 await c.query(`INSERT INTO delegaciones_personales(documento_id,oficina_id,usuario_id,oficina_nombre,persona_nombre,destinatario,actor_id,actor_nombre) VALUES($1,$2,$3,$4,$5,$6,$7,(SELECT concat_ws(' ',nombre,apellido) FROM usuarios WHERE id=$7))`,[id,datos.oficina_id,datos.usuario_id,oficina,persona,destinatario,actor.id]);
}

/** Filtra por autor y tipo antes de calcular filas y total; nunca consulta todo el catálogo en React. */
export async function listarDelegacionesPersonales(actor:ActorDocumental,f:{documento_id?:string;pagina:number;limite:number}){
 return (await conexionDocumental().query(`WITH visibles AS (
 SELECT p.documento_id::text,d.codigo,d.asunto,p.destinatario,p.oficina_nombre,p.persona_nombre,p.actor_nombre,to_jsonb(p.registrada_en)#>>'{}' fecha
 FROM delegaciones_personales p JOIN documentos d ON d.id=p.documento_id JOIN tipos_documentales td ON td.id=d.tipo_documental_id
 WHERE d.registrado_por_id=$1 AND p.actor_id=$1 AND NOT td.requiere_clave AND ($2::bigint IS NULL OR d.id=$2))
 SELECT (SELECT count(*)::int FROM visibles) total,coalesce((SELECT jsonb_agg(to_jsonb(v)) FROM (SELECT * FROM visibles ORDER BY fecha DESC,documento_id DESC LIMIT $3 OFFSET $4) v),'[]'::jsonb) delegaciones`,[actor.id,f.documento_id??null,f.limite,(f.pagina-1)*f.limite])).rows[0] as {total:number;delegaciones:unknown[]};
}
