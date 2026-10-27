import {useCallback,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import type {z} from 'zod';
import type {detalleDocumentoSchema} from '../schemas/documentos.schema';
import {useConsulta} from '../../../hooks/useConsulta';
import {EstadoCarga} from '../../../components/ui/EstadoCarga';
import * as api from '../api/documentos.api';
import * as movimientos from '../../movimientos/api/movimientos.api';
import styles from '../../../components/ui/Admin.module.css';
type Accion='autorizar'|'retirar-autorizacion'|'anular'|'solicitar-decision'|'salir';
const textos:Record<Accion,{titulo:string;explicacion:string;confirmacion:string}>={
 autorizar:{titulo:'Autorizar destinatario',explicacion:'Dirección registra una decisión. El documento permanece pendiente y no se crea un movimiento hasta la salida física.',confirmacion:'Autorizo expresamente la derivación al destinatario indicado.'},
 'retirar-autorizacion':{titulo:'Retirar autorización de salida',explicacion:'Se retira únicamente la autorización vigente. Se conservan el original y la historia de decisiones.',confirmacion:'Confirmo el retiro de esta autorización.'},
 'solicitar-decision':{titulo:'Solicitar decisión de Dirección',explicacion:'El original permanece en la misma custodia y ubicación mientras se solicita la decisión institucional.',confirmacion:'Confirmo la solicitud de decisión para esta gestión.'},
 salir:{titulo:'Confirmar salida física',explicacion:'Esta acción registra el traslado real del original. Consume la autorización de Dirección cuando corresponda.',confirmacion:'Confirmo que estoy realizando la salida física del original al destinatario indicado.'},
 anular:{titulo:'Anular registro documental',explicacion:'La anulación lógica conserva el código, las relaciones y la historia. Es distinta de concluir o invalidar un ingreso.',confirmacion:'Confirmo la anulación lógica del documento y comprendo que no se elimina su historia.'}
};
/** Cada acción tiene su explicación y confirmación; un conflicto conserva el borrador. */
export function DocumentoAcciones({documento:d,token,actualizar}:{documento:z.infer<typeof detalleDocumentoSchema>['documento'];token:string;actualizar:(mensaje:string)=>void}){
 const opciones=useConsulta(useCallback(()=>api.opciones(token),[token]));const navigate=useNavigate();
 const [accion,setAccion]=useState<Accion|null>(null),[error,setError]=useState(''),[enviando,setEnviando]=useState(false);
 const disponibles:Accion[]=[...(d.permisos.autorizar?['autorizar' as const,...(d.destinatario_autorizado_id?['retirar-autorizacion' as const]:[])]:[]),...(d.permisos.salir?['salir' as const]:[]),...(d.permisos.solicitar_decision?['solicitar-decision' as const]:[]),...(d.permisos.anular?['anular' as const]:[])];
 const texto=accion?textos[accion]:null;
 return <section className={styles.tarjeta}><h2>Acciones disponibles</h2><EstadoCarga {...opciones} reintentar={opciones.recargar}/>
 {d.permisos.editar && <p><Link to={`/documentos/${d.id}/editar`}>Corregir datos con motivo</Link></p>}
 {d.destinatario_autorizado_id && <p>Destinatario autorizado: {d.destinatario_autorizado??'Persona no disponible'} · {d.oficina_destino_autorizada??'Oficina no disponible'}. Decisión de {d.decision_autorizada_por??'Dirección'}.</p>}
 {d.estado_tramite==='PENDIENTE_DECISION' && <p>{d.destinatario_autorizado_id?'Autorización registrada; falta confirmar la salida física.':'La gestión espera una decisión de Dirección.'}</p>}
 <div className={styles.acciones}>{disponibles.map(a=><button key={a} className={a==='anular'?styles.peligro:styles.secundario} onClick={()=>{setAccion(a);setError('');}}>{textos[a].titulo}</button>)}</div>
 {!disponibles.length && <p>No hay acciones de escritura disponibles dentro de su alcance actual.</p>}
 {accion && texto && disponibles.includes(accion) && <form key={accion} onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget),motivo=String(f.get('motivo')??'').trim(),destino=d.destinatario_autorizado_id??String(f.get('destino')??'');setEnviando(true);setError('');try{
 if(accion==='salir'){const r=await movimientos.derivar(token,{documento_id:d.id,usuario_destino_id:destino,motivo});navigate(`/movimientos/${r.movimiento.id}`);}
 else {await api.operar(token,d.id,accion,accion==='autorizar'?{usuario_destino_id:String(f.get('destino')),motivo}:{motivo});setAccion(null);actualizar(texto.titulo+': hecho registrado en la historia.');}
 }catch(e){setError(e instanceof Error?e.message:'No se pudo completar la acción');}finally{setEnviando(false);}}}>
 <h3>{texto.titulo}</h3><p>{texto.explicacion}</p>
 {(accion==='autorizar'||(accion==='salir'&&!d.destinatario_autorizado_id)) && <label className={styles.campo}>Destinatario<select name="destino" required defaultValue=""><option value="">Seleccione una persona</option>{opciones.datos?.destinatarios.filter(u=>u.id!==d.responsable_actual_id).map(u=><option key={u.id} value={u.id}>{u.nombre} · {u.oficina}</option>)}</select></label>}
 <label className={styles.campo}>Motivo<textarea name="motivo" required maxLength={1000}/></label><label className={styles.campo}><input type="checkbox" required/>{texto.confirmacion}</label>
 {error && <p role="alert" className={styles.error}>{error}</p>}<button className={accion==='anular'?styles.peligro:styles.boton} disabled={enviando||opciones.cargando||!!opciones.error}>{texto.titulo}</button></form>}
 </section>;
}
