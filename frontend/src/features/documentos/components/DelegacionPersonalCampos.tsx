import type {opcionesSchema} from '../schemas/documentos.schema';
import type {z} from 'zod';
import styles from '../../../components/ui/Admin.module.css';

export const destinoPersonalVacio={oficina:'',destino:'',oficinaManual:false,personaManual:false,usuario:'',nombre:''};
export type DestinoPersonal=typeof destinoPersonalVacio;
export function construirDestinoPersonal(d:DestinoPersonal){
 const datos={oficina_id:d.oficinaManual?null:d.oficina||null,destino_manual:d.oficinaManual?d.destino.trim()||null:null,usuario_id:d.personaManual||d.oficinaManual?null:d.usuario||null,nombre:d.personaManual||d.oficinaManual?d.nombre.trim()||null:null};
 if(!Object.values(datos).some(Boolean))throw new Error('Indique al menos un destinatario');
 return datos;
}
/** Oficina y persona opcionales; solo se envían los campos del modo elegido. */
export function DelegacionPersonalCampos({valor:d,onChange,opciones}:{valor:DestinoPersonal;onChange:(d:DestinoPersonal)=>void;opciones:z.infer<typeof opcionesSchema>|null}){
 const cambiar=(p:Partial<DestinoPersonal>)=>onChange({...d,...p});
 return <div className={styles.datos}>
  <div className={styles.campo}><label htmlFor="personal-oficina-modo">Oficina o destino</label><select id="personal-oficina-modo" value={d.oficinaManual?'manual':'catalogo'} onChange={e=>cambiar({oficinaManual:e.target.value==='manual',usuario:''})}><option value="catalogo">Oficina registrada</option><option value="manual">Escribir destino</option></select></div>
  <div className={styles.campo}>{d.oficinaManual?<><label htmlFor="personal-destino">Destino</label><input id="personal-destino" maxLength={250} value={d.destino} onChange={e=>cambiar({destino:e.target.value})}/></>:<><label htmlFor="personal-oficina">Oficina</label><select id="personal-oficina" value={d.oficina} onChange={e=>cambiar({oficina:e.target.value,usuario:''})}><option value="">Sin oficina</option>{opciones?.oficinas.map(o=><option key={o.id} value={o.id}>{o.nombre}</option>)}</select></>}</div>
  {!d.oficinaManual&&<div className={styles.campo}><label htmlFor="personal-persona-modo">Persona</label><select id="personal-persona-modo" value={d.personaManual?'manual':'usuario'} onChange={e=>cambiar({personaManual:e.target.value==='manual'})}><option value="usuario">Usuario registrado</option><option value="manual">Escribir nombre</option></select></div>}
  <div className={styles.campo}>{d.personaManual||d.oficinaManual?<><label htmlFor="personal-nombre">Nombre</label><input id="personal-nombre" maxLength={250} value={d.nombre} onChange={e=>cambiar({nombre:e.target.value})}/></>:<><label htmlFor="personal-usuario">Usuario</label><select id="personal-usuario" value={d.usuario} onChange={e=>cambiar({usuario:e.target.value})}><option value="">Sin persona</option>{opciones?.destinatarios.filter(u=>!d.oficina||u.oficina_id===d.oficina).map(u=><option key={u.id} value={u.id}>{u.nombre}</option>)}</select></>}</div>
 </div>;
}
