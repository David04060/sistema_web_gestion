import {useCallback,useState} from 'react';
import {z} from 'zod';
import {apiRequest} from '../../../api/client';
import {useConsulta} from '../../../hooks/useConsulta';
import {EstadoCarga} from '../../../components/ui/EstadoCarga';
import {fechaLocal} from '../../../lib/fechas';
import styles from '../styles/Documentos.module.css';
import ui from '../../../components/ui/Admin.module.css';
const schema=z.object({total:z.number(),pagina:z.number(),limite:z.number(),hechos:z.array(z.object({id:z.string(),tipo:z.string(),fecha:z.string(),responsable:z.string(),descripcion:z.string()}))});
const titulos:Record<string,string>={REGISTRO:'Registro documental',DECISION:'Decisión de Dirección',SOLICITUD_DECISION:'Solicitud de decisión',CORRECCION:'Corrección documental',SALIDA:'Salida física',RECEPCION:'Recepción física',RECHAZO:'Rechazo',RECUPERACION:'Recuperación en origen',CANCELACION:'Cancelación del traslado',INGRESO:'Ingreso por Mesa de Partes',CONTINUACION:'Continuación del ingreso',EVIDENCIA_RESULTADO:'Evidencia del resultado',CONCLUSION:'Conclusión del ingreso',INVALIDACION:'Invalidación del ingreso',RELEVO:'Original aceptado en relevo',AUTORIZACION_SUSTITUCION:'Autorización de sustitución',SUSTITUCION:'Intervención del ejecutante designado'};
export function RecorridoDocumento({token,id}:{token:string;id:string}){
 const [pagina,setPagina]=useState(1);const consulta=useConsulta(useCallback(()=>apiRequest(`/api/documentos/${id}/recorrido?pagina=${pagina}`,schema,{},token),[token,id,pagina]));
 return <section className={ui.tarjeta}><h2>Recorrido del original</h2><p>Hechos registrados en orden cronológico. Cada ingreso conserva su gestión y cada intervención identifica a su responsable.</p><EstadoCarga {...consulta} reintentar={consulta.recargar}/><div className={styles.historial}>{consulta.datos?.hechos.map(h=><article key={h.id}><h3>{titulos[h.tipo]??'Actuación documental'}</h3><p>{h.responsable} · {fechaLocal(h.fecha)}</p><p style={{whiteSpace:'pre-wrap'}}>{h.descripcion}</p></article>)}</div>
 {consulta.datos && <div className={ui.paginacion}><p>{consulta.datos.total} hechos · Página {pagina}</p><button className={ui.secundario} disabled={pagina<=1} onClick={()=>setPagina(p=>p-1)}>Hechos anteriores</button><button className={ui.secundario} disabled={pagina*consulta.datos.limite>=consulta.datos.total} onClick={()=>setPagina(p=>p+1)}>Hechos siguientes</button></div>}</section>;
}
