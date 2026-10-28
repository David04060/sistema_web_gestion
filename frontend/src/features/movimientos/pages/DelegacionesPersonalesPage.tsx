import {useCallback} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {z} from 'zod';
import {apiRequest} from '../../../api/client';
import {useAuth} from '../../auth/hooks/useAuth';
import {useConsulta} from '../../../hooks/useConsulta';
import {EstadoCarga} from '../../../components/ui/EstadoCarga';
import {fechaLocal} from '../../../lib/fechas';
import styles from '../../../components/ui/Admin.module.css';
import documentoStyles from '../../documentos/styles/Documentos.module.css';

export const delegacionesPersonalesSchema=z.object({total:z.number().int(),pagina:z.number().int(),limite:z.number().int(),delegaciones:z.array(z.object({documento_id:z.string(),codigo:z.string(),asunto:z.string(),destinatario:z.string(),actor_nombre:z.string(),fecha:z.string()}))});
/** Bandeja personal paginada: no carga operaciones del circuito anterior. */
export function DelegacionesPersonalesPage(){
 const token=useAuth().sesion!.token,[params,setParams]=useSearchParams();
 const filtro=new URLSearchParams();for(const k of ['documento_id','pagina'])if(params.get(k))filtro.set(k,params.get(k)!);const q=filtro.toString();
 const consulta=useConsulta(useCallback(()=>apiRequest('/api/movimientos?'+q,delegacionesPersonalesSchema,{},token),[token,q]));
 function pagina(n:number){const p=new URLSearchParams(filtro);p.set('pagina',String(n));setParams(p);}
 return <main className={styles.pagina}><div className={styles.titulo}><h1>Mis delegaciones</h1><button className={styles.secundario} onClick={consulta.recargar}>Actualizar listado</button></div>
  <EstadoCarga {...consulta} reintentar={consulta.recargar}/>
  {consulta.datos&&<section className={styles.tarjeta}><p>{consulta.datos.total} delegaciones</p><div className={documentoStyles.relacionados}>{consulta.datos.delegaciones.map(d=><article key={d.documento_id}><h2>{d.codigo}</h2><p>{d.asunto}</p><p>Destinatario: {d.destinatario}</p><p>{d.actor_nombre} · {fechaLocal(d.fecha)}</p><Link className={styles.secundario} to={'/documentos/'+d.documento_id}>Ver documento</Link></article>)}</div>
  <div className={styles.acciones}><button className={styles.secundario} disabled={consulta.datos.pagina<=1} onClick={()=>pagina(consulta.datos!.pagina-1)}>Anterior</button><button className={styles.secundario} disabled={consulta.datos.pagina*consulta.datos.limite>=consulta.datos.total} onClick={()=>pagina(consulta.datos!.pagina+1)}>Siguiente</button></div></section>}
 </main>;
}
