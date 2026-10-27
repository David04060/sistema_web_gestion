import type {Pool,PoolClient} from 'pg';
/** Resuelve solo referencias presentes en la historia ya autorizada. No reescribe hechos ni nombres históricos. */
export async function legible(filas:Record<string,unknown>[],c:Pool|PoolClient){
 const usuarios=new Set<string>(),oficinas=new Set<string>(),archivadores=new Set<string>(),tipos=new Set<string>();
 const grupo=(campo:string)=>['registrado_por_id','responsable_actual_id','destinatario_autorizado_id','decision_autorizada_por_id'].includes(campo)?usuarios:['oficina_responsable_id','oficina_destino_autorizada_id'].includes(campo)?oficinas:campo==='archivador_id'?archivadores:campo==='tipo_documental_id'?tipos:null;
 function reunir(campo:string,v:unknown){if(v&&typeof v==='object'){for(const valor of Object.values(v))reunir(campo,valor);}else if(v!==null&&v!==undefined&&/^[1-9][0-9]*$/.test(String(v)))grupo(campo)?.add(String(v));}
 for(const f of filas)for(const [campo,v] of Object.entries((f.campos_modificados??{}) as Record<string,unknown>))reunir(campo,v);
 const refs=(await c.query<{grupo:string;id:string;nombre:string}>(`SELECT 'usuario' grupo,id::text,concat_ws(' ',nombre,apellido) nombre FROM usuarios WHERE id=ANY($1::bigint[])
 UNION ALL SELECT 'oficina',id::text,nombre FROM oficinas WHERE id=ANY($2::bigint[])
 UNION ALL SELECT 'archivador',a.id::text,concat(e.codigo,' / Archivador ',a.numero) FROM archivadores a JOIN estantes e ON e.id=a.estante_id WHERE a.id=ANY($3::bigint[])
 UNION ALL SELECT 'tipo',id::text,nombre FROM tipos_documentales WHERE id=ANY($4::bigint[])`,[[...usuarios],[...oficinas],[...archivadores],[...tipos]])).rows;
 const nombres=new Map(refs.map(r=>[r.grupo+':'+r.id,r.nombre]));
 function resolver(campo:string,v:unknown):unknown{if(v===null)return null;if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,resolver(campo,x)]));const g=grupo(campo);if(!g)return v;const tipo=g===usuarios?'usuario':g===oficinas?'oficina':g===archivadores?'archivador':'tipo';return nombres.get(tipo+':'+String(v))??'Referencia histórica no disponible';}
 return filas.map(f=>({...f,campos_legibles:Object.fromEntries(Object.entries((f.campos_modificados??{}) as Record<string,unknown>).map(([campo,v])=>[campo,resolver(campo,v)]))}));
}
