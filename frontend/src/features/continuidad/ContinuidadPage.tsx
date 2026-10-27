import { etiquetasEstado } from '../../lib/estados-documentales';
import {useCallback,useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/hooks/useAuth';
import {useConsulta} from '../../hooks/useConsulta';
import {EstadoCarga} from '../../components/ui/EstadoCarga';
import {fechaLocal} from '../../lib/fechas';
import * as api from './continuidad.api';
import * as archivos from '../archivos/api/archivos.api';
import * as documentos from '../documentos/api/documentos.api';
import * as movimientos from '../movimientos/api/movimientos.api';
import * as usuarios from '../usuarios/api/usuarios.api';
import styles from '../../components/ui/Admin.module.css';

/** Responsabilidad, originales físicos e intervenciones pendientes se presentan por separado. */
export function ContinuidadPage(){
 const {sesion}=useAuth();const token=sesion!.token,admin=sesion!.usuario.rol==='Administrador';
 const caps=useConsulta(useCallback(()=>api.capacidades(token),[token]));
 return <main className={styles.pagina}><h1>Continuidad institucional</h1><p>La responsabilidad del archivo, la pertenencia archivística, la custodia del original y su ubicación física son hechos distintos.</p>
 <EstadoCarga {...caps} reintentar={caps.recargar}/>
 {caps.datos?.relevos && <Relevos token={token} admin={admin}/>}
 {caps.datos?.sustituciones && !admin && <Sustituciones token={token}/>}
 {caps.datos && !caps.datos.relevos && !caps.datos.sustituciones && <p>La continuidad institucional aún no está habilitada en este entorno.</p>}
 </main>;
}
function Paginas({pagina,total,limite,cambiar}:{pagina:number;total:number;limite:number;cambiar:(p:number)=>void}){
 return <div className={styles.paginacion}><p>{total} registros · Página {pagina}</p><div className={styles.acciones}><button className={styles.secundario} disabled={pagina<=1} onClick={()=>cambiar(pagina-1)}>Anterior</button><button className={styles.secundario} disabled={pagina*limite>=total} onClick={()=>cambiar(pagina+1)}>Siguiente</button></div></div>;
}
function Relevos({token,admin}:{token:string;admin:boolean}){
 const [pagina,setPagina]=useState(1),[seleccion,setSeleccion]=useState<api.Relevo|null>(null),[mensaje,setMensaje]=useState('');
 const consulta=useConsulta(useCallback(()=>api.relevos(token,pagina),[token,pagina]));
 const actualizar=()=>{consulta.recargar();setMensaje('Hecho de continuidad registrado. La custodia cambia únicamente al aceptar cada original.');};
 return <section className={styles.tarjeta}><h2>Relevos de responsabilidad</h2>{mensaje && <p role="status" className={styles.exito}>{mensaje}</p>}
 {admin && <Formalizar token={token} terminado={actualizar}/>}
 <EstadoCarga {...consulta} reintentar={consulta.recargar}/>
 {consulta.datos?.relevos.map(r=><article key={r.id} className={styles.tarjeta}><h3>{r.archivo}</h3><p>{r.saliente} → {r.entrante}</p><p>Formalizado por {r.formalizador} · {fechaLocal(r.fecha_formalizacion)}</p><p>{r.motivo}</p><p>{r.fecha_aceptacion?'Responsabilidad aceptada el '+fechaLocal(r.fecha_aceptacion):'Pendiente de aceptación personal del responsable entrante'}</p>
 {!admin && <button className={styles.secundario} onClick={()=>setSeleccion(r)}>Consultar originales presentados</button>}
 {consulta.datos?.actor_id===r.responsable_entrante_id && !r.fecha_aceptacion && <Confirmar token={token} titulo="Aceptar responsabilidad del archivo" ruta={`relevos/${r.id}/aceptacion`} datos={{confirmar:true}} explicacion="Acepto la responsabilidad. Los originales conservarán su custodio hasta que confirme su recepción física individual." terminado={()=>{setSeleccion(null);actualizar();}}/>}
 </article>)}
 {consulta.datos && <Paginas {...consulta.datos} cambiar={setPagina}/>}
 {seleccion && !admin && <Originales key={seleccion.id} token={token} relevo={seleccion} actor={consulta.datos?.actor_id??''} terminado={actualizar}/>}
 </section>;
}
/** Formalizar nunca acepta originales en nombre de otra persona. */
function Formalizar({token,terminado}:{token:string;terminado:()=>void}){
 const [archivo,setArchivo]=useState(''),[error,setError]=useState(''),[enviando,setEnviando]=useState(false);
 const datos=useConsulta(useCallback(async()=>({archivos:await archivos.listar(token,'limite=100'),catalogos:await usuarios.listar(token,'activo=true&limite=100')}),[token]));
 const a=datos.datos?.archivos.archivos.find(a=>a.id===archivo);
 return <details><summary>Formalizar cambio de responsable</summary><EstadoCarga {...datos} reintentar={datos.recargar}/><form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(!a)return;setError('');setEnviando(true);try{await api.enviar(token,'relevos',{archivo_id:a.id,asignacion_saliente_id:a.asignacion_id,responsable_entrante_id:String(f.get('responsable')),motivo:String(f.get('motivo')),confirmar:true});terminado();}catch(e){setError(e instanceof Error?e.message:'No se pudo formalizar');}finally{setEnviando(false);}}}>
 <label className={styles.campo}>Archivo institucional<select required value={archivo} onChange={e=>setArchivo(e.target.value)}><option value="">Seleccione el archivo</option>{datos.datos?.archivos.archivos.map(a=><option key={a.id} value={a.id}>{a.nombre} · {a.oficina} · {a.responsable}</option>)}</select></label>
 <label className={styles.campo}>Responsable entrante<select name="responsable" required><option value="">Seleccione una persona activa de la misma oficina</option>{datos.datos?.catalogos.usuarios?.filter(u=>u.oficina_id===a?.oficina_id&&u.id!==a?.responsable_id).map(u=><option key={u.id} value={u.id}>{u.nombre} {u.apellido}</option>)}</select></label>
 <label className={styles.campo}>Motivo del relevo<textarea name="motivo" required maxLength={1000}/></label><label className={styles.campo}><input type="checkbox" required/>Confirmo el cambio de responsabilidad y conservo la custodia de cada original hasta su entrega.</label>
 {error && <p role="alert" className={styles.error}>{error}</p>}<button className={styles.boton} disabled={enviando||!a}>Formalizar relevo</button> <button type="button" className={styles.secundario} onClick={datos.recargar}>Actualizar responsables sin borrar el motivo</button></form></details>;
}
function Originales({token,relevo:r,actor,terminado}:{token:string;relevo:api.Relevo;actor:string;terminado:()=>void}){
 const [pagina,setPagina]=useState(1);const consulta=useConsulta(useCallback(()=>api.originales(token,r.id,pagina),[token,r.id,pagina]));
 return <section><h3>Originales presentados · {r.archivo}</h3><p>Este inventario ordinario no incluye SíseVe ni transfiere automáticamente originales que estén con otros custodios.</p><EstadoCarga {...consulta} reintentar={consulta.recargar}/>
 {consulta.datos?.originales.map(d=><article key={d.id} className={styles.tarjeta}><h4>{d.codigo}</h4><p>{d.asunto}</p>{!d.disponible && <p>El original tiene una gestión física o autorización pendiente y no puede aceptarse aún.</p>}
 {actor===r.responsable_entrante_id && r.fecha_aceptacion && d.disponible && <AceptarOriginal token={token} relevo={r.id} documento={d.id} terminado={()=>{consulta.recargar();terminado();}}/>}</article>)}
 {consulta.datos && <Paginas {...consulta.datos} cambiar={setPagina}/>}</section>;
}
function AceptarOriginal({token,relevo,documento,terminado}:{token:string;relevo:string;documento:string;terminado:()=>void}){
 const [continuar,setContinuar]=useState(true),[error,setError]=useState(''),[enviando,setEnviando]=useState(false);
 const opciones=useConsulta(useCallback(()=>documentos.opciones(token),[token]));
 return <form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);setEnviando(true);setError('');try{await api.enviar(token,`relevos/${relevo}/originales`,{documento_id:documento,motivo:String(f.get('motivo')),confirmar_tenencia:true,continuar_ubicacion:continuar,archivador_id:String(f.get('archivador')??'')||null});terminado();}catch(e){setError(e instanceof Error?e.message:'No se pudo recibir');}finally{setEnviando(false);}}}>
 <label className={styles.campo}><input type="checkbox" checked={continuar} onChange={e=>setContinuar(e.target.checked)}/>El original continúa en su ubicación física confirmada</label>
 {!continuar && <label className={styles.campo}>Ubicación de recepción<select name="archivador"><option value="">Sin archivador</option>{opciones.datos?.archivadores.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>}
 <label className={styles.campo}>Motivo y constancia de entrega<textarea name="motivo" required maxLength={1000}/></label><label className={styles.campo}><input type="checkbox" required/>Confirmo que recibí físicamente este original y asumo su custodia.</label>
 {error && <p role="alert" className={styles.error}>{error}</p>}<button className={styles.boton} disabled={enviando}>Aceptar este original</button></form>;
}
function Confirmar({token,titulo,ruta,datos,explicacion,terminado}:{token:string;titulo:string;ruta:string;datos:unknown;explicacion:string;terminado:()=>void}){
 const [error,setError]=useState(''),[enviando,setEnviando]=useState(false);
 return <form onSubmit={async e=>{e.preventDefault();setError('');setEnviando(true);try{await api.enviar(token,ruta,datos);terminado();}catch(e){setError(e instanceof Error?e.message:'No se pudo registrar');}finally{setEnviando(false);}}}><label className={styles.campo}><input type="checkbox" required/>{explicacion}</label>{error && <p role="alert" className={styles.error}>{error}</p>}<button className={styles.boton} disabled={enviando}>{titulo}</button></form>;
}
function Sustituciones({token}:{token:string}){
 const [pagina,setPagina]=useState(1);const consulta=useConsulta(useCallback(()=>api.sustituciones(token,pagina),[token,pagina]));
 return <section className={styles.tarjeta}><h2>Sustituciones excepcionales</h2><p>Una designación afecta solo a la intervención pendiente indicada y mantiene la oficina y los participantes originales. No concede acceso a SíseVe.</p>
 {consulta.datos?.puede_autorizar && <Designar token={token} terminado={consulta.recargar}/>}
 <EstadoCarga {...consulta} reintentar={consulta.recargar}/>
 {consulta.datos?.sustituciones.map(s=><article key={s.id} className={styles.tarjeta}><h3>{s.codigo} · {s.intervencion==='DESTINO'?'Intervención en destino':'Intervención en origen'}</h3><p>Participante original: {s.participante_original}. Persona designada: {s.sustituto}. Oficina: {s.oficina}.</p><p>Autorizado expresamente por {s.autorizado_por} · {fechaLocal(s.fecha_autorizacion)}</p><p>{s.motivo}</p>{s.fecha_fin?<p>Finalizada el {fechaLocal(s.fecha_fin)} · {s.operacion_real?({RECIBIR:'Recepción física',RECHAZAR:'Rechazo',RECUPERAR:'Recuperación física',CANCELAR:'Cancelación con recuperación'}[s.operacion_real]??'Intervención registrada'):'Designación retirada'} · {s.ejecutante_real??s.autorizado_por}</p>:<>
 {consulta.datos?.actor_id===s.sustituto_id && <Ejecutar token={token} s={s} terminado={consulta.recargar}/>}
 {consulta.datos?.puede_autorizar && <Retirar token={token} s={s} terminado={consulta.recargar}/>}</>}
 <Link to={`/movimientos/${s.movimiento_id}`}>Consultar movimiento conforme al alcance documental</Link></article>)}
 {consulta.datos && <Paginas {...consulta.datos} cambiar={setPagina}/>}</section>;
}
function Designar({token,terminado}:{token:string;terminado:()=>void}){
 const [movimiento,setMovimiento]=useState(''),[intervencion,setIntervencion]=useState<'ORIGEN'|'DESTINO'>('DESTINO'),[error,setError]=useState(''),[enviando,setEnviando]=useState(false);
 const datos=useConsulta(useCallback(async()=>({movimientos:await movimientos.listar(token,'limite=50'),opciones:await documentos.opciones(token)}),[token]));
 const m=datos.datos?.movimientos.movimientos.find(m=>m.id===movimiento);const oficina=intervencion==='DESTINO'?m?.oficina_destino_id:m?.oficina_origen_id;const titular=intervencion==='DESTINO'?m?.usuario_destino_id:m?.usuario_origen_id;
 return <details><summary>Autorizar una sustitución excepcional</summary><EstadoCarga {...datos} reintentar={datos.recargar}/><form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);setEnviando(true);setError('');try{await api.enviar(token,'sustituciones',{movimiento_id:movimiento,intervencion,sustituto_id:String(f.get('persona')),motivo:String(f.get('motivo')),confirmar_autorizacion:true});terminado();}catch(e){setError(e instanceof Error?e.message:'No se pudo autorizar');}finally{setEnviando(false);}}}>
 <label className={styles.campo}>Movimiento pendiente<select value={movimiento} onChange={e=>setMovimiento(e.target.value)} required><option value="">Seleccione un movimiento</option>{datos.datos?.movimientos.movimientos.filter(m=>m.estado==='EN_TRASLADO'||(m.estado==='RECHAZADO'&&!m.devolucion_confirmada_por_id)).map(m=><option key={m.id} value={m.id}>{m.codigo} · {m.usuario_origen} → {m.usuario_destino} · {etiquetasEstado[m.estado]??m.estado}</option>)}</select></label>
 <label className={styles.campo}>Intervención<select value={intervencion} onChange={e=>setIntervencion(e.target.value as 'ORIGEN'|'DESTINO')}><option value="DESTINO">Recepción o rechazo en la oficina de destino</option><option value="ORIGEN">Recuperación o cancelación en la oficina de origen</option></select></label>
 <label className={styles.campo}>Persona designada<select name="persona" required><option value="">Seleccione una persona activa de la misma oficina</option>{datos.datos?.opciones.destinatarios.filter(p=>p.oficina_id===oficina&&p.id!==titular).map(p=><option key={p.id} value={p.id}>{p.nombre} · {p.oficina}</option>)}</select></label>
 <label className={styles.campo}>Fundamento de la autorización institucional<textarea name="motivo" required maxLength={1000}/></label><label className={styles.campo}><input type="checkbox" required/>Como Dirección autorizo expresamente esta sustitución para esta intervención. La designación no confirma ningún hecho físico.</label>{error && <p role="alert" className={styles.error}>{error}</p>}<button className={styles.boton} disabled={enviando}>Autorizar sustitución</button></form></details>;
}
function Ejecutar({token,s,terminado}:{token:string;s:api.Sustitucion;terminado:()=>void}){
 const [operacion,setOperacion]=useState(''),[error,setError]=useState(''),[enviando,setEnviando]=useState(false);
 const opciones=useConsulta(useCallback(()=>documentos.opciones(token),[token]));
 const acciones=s.intervencion==='DESTINO'?(s.estado_movimiento==='EN_TRASLADO'?[['RECIBIR','Confirmar recepción física'],['RECHAZAR','Registrar rechazo']]:[]):s.estado_movimiento==='EN_TRASLADO'?[['CANCELAR','Cancelar traslado con recuperación física']]:s.estado_movimiento==='RECHAZADO'&&s.recuperacion_pendiente?[['RECUPERAR','Confirmar recuperación física']]:[];
 return <div>{!acciones.length && <p>La intervención ya no está pendiente. La designación no permite realizar otra operación sobre este movimiento.</p>}<div className={styles.acciones}>{acciones.map(([v,t])=><button className={styles.secundario} key={v} onClick={()=>setOperacion(v)}>{t}</button>)}</div>{operacion && <form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);setEnviando(true);setError('');try{await api.enviar(token,`sustituciones/${s.id}/actuacion`,{operacion,motivo:String(f.get('motivo')),confirmar_hecho:true,archivador_id:String(f.get('archivador')??'')||null});terminado();}catch(e){setError(e instanceof Error?e.message:'No se pudo confirmar');}finally{setEnviando(false);}}}>
 <h4>{acciones.find(([v])=>v===operacion)?.[1]}</h4><label className={styles.campo}>Motivo<textarea name="motivo" required maxLength={1000}/></label>
 {operacion!=='RECHAZAR' && <label className={styles.campo}>Ubicación física confirmada<select name="archivador"><option value="">Sin archivador</option>{opciones.datos?.archivadores.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>}
 <label className={styles.campo}><input type="checkbox" required/>{operacion==='RECHAZAR'?'Confirmo el rechazo. No confirmo recepción ni recuperación.':'Confirmo que el original está físicamente bajo mi tenencia para esta intervención.'}</label>{error && <p role="alert" className={styles.error}>{error}</p>}<button className={styles.boton} disabled={enviando}>Registrar este hecho</button></form>}</div>;
}
function Retirar({token,s,terminado}:{token:string;s:api.Sustitucion;terminado:()=>void}){
 const [motivo,setMotivo]=useState('');return <details><summary>Retirar designación pendiente</summary><label className={styles.campo}>Motivo de retiro<textarea value={motivo} onChange={e=>setMotivo(e.target.value)} maxLength={1000}/></label>{motivo.trim() && <Confirmar token={token} titulo="Retirar designación" ruta={`sustituciones/${s.id}/finalizacion`} datos={{motivo,confirmar:true}} explicacion="Retiro esta designación sin confirmar recepción, recuperación o cancelación del movimiento." terminado={terminado}/>}</details>;
}
