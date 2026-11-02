import {useCallback,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {config,rutaUnidades,padresElegibles} from '../../../api/documental';
import {esAdministracion} from '../../../lib/perfiles';
import {useAuth} from '../../auth/hooks/useAuth';
import {useConsulta} from '../../../hooks/useConsulta';
import {EstadoCarga} from '../../../components/ui/EstadoCarga';
import styles from '../../../components/ui/Admin.module.css';
export function UbicacionesPage(){
 const {token,usuario}=useAuth().sesion!,admin=esAdministracion(usuario.rol),[params,setParams]=useSearchParams(),seleccion=params.get('usuario')??'';
 const cuentas=useConsulta(useCallback(()=>config.usuarios(token),[token]),{habilitada:admin});
 const elegibles=cuentas.datos?.usuarios.filter(u=>!!u.oficina_id&&[3,4,5].includes(u.rol_id))??[];
 const target=admin?elegibles.find(u=>u.id===seleccion)?.id:usuario.id;
 return <main className={styles.pagina}><h1>{admin?'Ubicaciones por cuenta':'Mis ubicaciones'}</h1><p>Crea un lugar independiente o agrega contenido identificado dentro de un lugar. Los documentos pueden guardarse directamente en cualquiera de ellos.</p>
 {admin?<><EstadoCarga {...cuentas} reintentar={cuentas.recargar}/><label className={styles.campo}>Cuenta con oficina<select value={seleccion} onChange={e=>setParams(e.target.value?{usuario:e.target.value}:{})}><option value="">Seleccionar cuenta</option>{elegibles.map(u=><option key={u.id} value={u.id}>{u.nombre} {u.apellido} · {u.oficina}</option>)}</select></label></>:!usuario.oficina_id?<p className={styles.aviso}>No tienes oficina asignada. Puedes registrar documentos sin ubicación.</p>:null}
 {target&&(admin||usuario.oficina_id)&&<UnidadesCuenta key={target} token={token} usuario={target} admin={admin}/>}
 </main>;
}
type Unidad={id:string;clase:string;nombre:string;padre_id:string|null;activo:boolean};
function UnidadesCuenta({token,usuario,admin}:{token:string;usuario:string;admin:boolean}){
 const consulta=useConsulta(useCallback(()=>config.unidades(token,admin?usuario:undefined),[token,usuario,admin]));
 const [modo,setModo]=useState<'lugar'|'contenido'>('lugar'),[edicion,setEdicion]=useState<Unidad>(),[clase,setClase]=useState(''),[nombre,setNombre]=useState(''),[padre,setPadre]=useState(''),[error,setError]=useState(''),[mensaje,setMensaje]=useState(''),[ocupado,setOcupado]=useState(false);
 const unidades=consulta.datos?.unidades??[],candidatos=padresElegibles(unidades,edicion?.id).filter(u=>u.activo&&(!u.padre_id||u.id===edicion?.padre_id));
 function comenzar(tipo:'lugar'|'contenido'){setModo(tipo);setEdicion(undefined);setNombre('');setClase('');setPadre('');setError('');}
 function editar(u:Unidad){setModo(u.padre_id?'contenido':'lugar');setEdicion(u);setNombre(u.nombre);setClase(u.clase);setPadre(u.padre_id??'');setMensaje('');document.getElementById('formulario-ubicacion')?.scrollIntoView({block:'start'});}
 async function guardar(e:React.FormEvent){e.preventDefault();if(ocupado)return;setOcupado(true);setError('');setMensaje('');try{
 await config.guardar(token,'ubicaciones'+(edicion?'/'+edicion.id:''),{clase:modo==='lugar'?edicion?.clase??'Lugar':clase.trim(),nombre:nombre.trim(),padre_id:modo==='lugar'?null:padre,...(admin?{propietario_id:usuario}:{})},edicion?'PUT':'POST');
 setMensaje(edicion?'Ubicación actualizada.':'Ubicación creada.');comenzar(modo);consulta.recargar();
 }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar');}finally{setOcupado(false);}}
 function grupo(u:Unidad,visitados=new Set<string>()):React.ReactNode{
 if(visitados.has(u.id))return null;const siguientes=new Set([...visitados,u.id]);const hijos=unidades.filter(v=>v.padre_id===u.id);
 return <li key={u.id}><div className={styles.filaOficina}><div><strong>{u.padre_id?u.nombre:rutaUnidades(unidades,u.id)}</strong>{u.padre_id&&<small> · {u.clase}</small>}{!u.activo&&<span> (inactiva)</span>}</div><button className={styles.secundario} disabled={ocupado} onClick={()=>editar(u)}>Editar {u.padre_id?'contenido':'lugar'}</button></div>{!!hijos.length&&<ul>{hijos.map(h=>grupo(h,siguientes))}</ul>}</li>;
 }
 return <><EstadoCarga {...consulta} reintentar={consulta.recargar}/><section className={styles.tarjeta}><h2>Lugares y contenido</h2>{unidades.length?<ul className={styles.arbolUbicaciones}>{unidades.filter(u=>!u.padre_id).map(u=>grupo(u))}</ul>:<p className={styles.vacio}>Aún no hay lugares registrados.</p>}</section>
 <section className={styles.tarjeta} id="formulario-ubicacion"><div className={styles.acciones}><button className={modo==='lugar'?styles.boton:styles.secundario} aria-pressed={modo==='lugar'} disabled={ocupado} onClick={()=>comenzar('lugar')}>Crear lugar</button><button className={modo==='contenido'?styles.boton:styles.secundario} aria-pressed={modo==='contenido'} disabled={ocupado} onClick={()=>comenzar('contenido')}>Agregar contenido a un lugar</button></div>
 <h2 className={styles.tituloAuditoria}>{edicion?'Editar '+(modo==='lugar'?'lugar':'contenido'):modo==='lugar'?'Nuevo lugar':'Nuevo contenido'}</h2>
 <form onSubmit={e=>void guardar(e)}><fieldset className={styles.grupoDestino} disabled={ocupado}><div className={styles.formularioDosColumnas}>
 {modo==='contenido'&&<label className={styles.campo}>Elemento físico<input required maxLength={100} placeholder="Archivador, portafolio, escalafón…" value={clase} onChange={e=>setClase(e.target.value)}/></label>}
 <label className={styles.campo}>{modo==='lugar'?'Nombre del lugar':'Identificador del contenido'}<input required maxLength={250} placeholder={modo==='lugar'?'Estante A, caja de expedientes…':'Informes de marzo…'} value={nombre} onChange={e=>setNombre(e.target.value)}/></label>
 {modo==='contenido'&&<label className={styles.campo}>Lugar donde estará<select required value={padre} onChange={e=>setPadre(e.target.value)}><option value="">Seleccionar lugar</option>{candidatos.map(u=><option key={u.id} value={u.id}>{rutaUnidades(unidades,u.id)}</option>)}</select></label>}
 </div><div className={styles.acciones}><button className={styles.boton} disabled={ocupado||modo==='contenido'&&!padre}>{ocupado?'Guardando…':edicion?'Guardar cambios':modo==='lugar'?'Guardar lugar':'Guardar contenido'}</button>{edicion&&<button type="button" className={styles.secundario} onClick={()=>comenzar(modo)}>Cancelar edición</button>}</div></fieldset></form>
 {error&&<p className={styles.error} role="alert">{error}</p>}{mensaje&&<p className={styles.exito} role="status">{mensaje}</p>}
 </section></>;
}
