import {useCallback,useState} from 'react';
import type {z} from 'zod';
import {useAuth} from '../../auth/hooks/useAuth';
import {useConsulta} from '../../../hooks/useConsulta';
import {EstadoCarga} from '../../../components/ui/EstadoCarga';
import type {movimientoSchema} from '../schemas/movimientos.schema';
import * as documentos from '../../documentos/api/documentos.api';
import * as api from '../api/movimientos.api';
import styles from '../../../components/ui/Admin.module.css';
type Accion='recibir'|'rechazar'|'recuperar'|'cancelar';
const textos:Record<Accion,{titulo:string;confirmacion:string}>={recibir:{titulo:'Confirmar recepción física',confirmacion:'Recibí físicamente el original y confirmo su ubicación.'},rechazar:{titulo:'Rechazar recepción con motivo',confirmacion:'Confirmo el rechazo. No confirmo recepción ni recuperación física.'},recuperar:{titulo:'Confirmar recuperación física',confirmacion:'Tengo nuevamente el original en origen y confirmo su ubicación.'},cancelar:{titulo:'Cancelar traslado con original recuperado',confirmacion:'Confirmo la cancelación y que tengo nuevamente el original en origen.'}};
/** Botones separados y confirmaciones propias; los errores conservan los datos ingresados. */
export function MovimientoAcciones({movimiento:m,actualizar}:{movimiento:z.infer<typeof movimientoSchema>;actualizar:(mensaje:string)=>void}){
 const sesion=useAuth().sesion!;const opciones=useConsulta(useCallback(()=>documentos.opciones(sesion.token),[sesion.token]));
 const [accion,setAccion]=useState<Accion|null>(null),[error,setError]=useState(''),[enviando,setEnviando]=useState(false);
 const destino=m.usuario_destino_id===sesion.usuario.id,origen=m.usuario_origen_id===sesion.usuario.id;
 const acciones:Accion[]=[...(destino&&m.estado==='EN_TRASLADO'?['recibir' as const,'rechazar' as const]:[]),...(origen&&m.estado==='EN_TRASLADO'?['cancelar' as const]:[]),...(origen&&m.estado==='RECHAZADO'&&!m.devolucion_confirmada_por_id?['recuperar' as const]:[])];
 if(!acciones.length)return null;
 return <section className={styles.tarjeta}><h2>Acciones sobre el original</h2><EstadoCarga {...opciones} reintentar={opciones.recargar}/><div className={styles.acciones}>{acciones.map(a=><button key={a} className={styles.secundario} onClick={()=>{setAccion(a);setError('');}}>{textos[a].titulo}</button>)}</div>
 {accion && acciones.includes(accion) && <form key={accion} onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget),motivo=String(f.get('motivo')??''),archivador_id=String(f.get('archivador')??'')||null;setEnviando(true);setError('');try{await api.operar(sesion.token,m.id,accion,accion==='recibir'?{archivador_id}:accion==='rechazar'?{motivo}:{archivador_id,motivo,confirmar_recuperacion:true});setAccion(null);actualizar(textos[accion].titulo+': hecho registrado.');}catch(e){setError(e instanceof Error?e.message:'No se pudo registrar');}finally{setEnviando(false);}}}>
 <h3>{textos[accion].titulo}</h3>
 {accion!=='rechazar' && <label className={styles.campo}>Ubicación física confirmada<select name="archivador"><option value="">Sin archivador</option>{opciones.datos?.archivadores.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>}
 {accion!=='recibir' && <label className={styles.campo}>Motivo<textarea name="motivo" required maxLength={1000}/></label>}
 <label className={styles.campo}><input type="checkbox" required/>{textos[accion].confirmacion}</label>{error && <p role="alert" className={styles.error}>{error}</p>}<button className={styles.boton} disabled={enviando||opciones.cargando||!!opciones.error}>{textos[accion].titulo}</button></form>}
 </section>;
}
