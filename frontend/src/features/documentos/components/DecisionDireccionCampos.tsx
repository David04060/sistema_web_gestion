import type {z} from 'zod';
import type {opcionesSchema} from '../schemas/documentos.schema';
import styles from '../../../components/ui/Admin.module.css';
import documentoStyles from '../styles/Documentos.module.css';

export interface DecisionDireccion {
    accion:'PENDIENTE'|'DELEGAR'|'GUARDAR_DIRECCION';
    oficina:string;persona:'usuario'|'manual';usuario:string;nombre:string;observaciones:string;
    estante:string;archivador:string;
}
export const decisionVacia:DecisionDireccion={accion:'PENDIENTE',oficina:'',persona:'usuario',usuario:'',nombre:'',observaciones:'',estante:'',archivador:''};

/** Un único contrato de destino para el registro y el detalle. Los campos inactivos no se envían. */
export function construirDecision(d:DecisionDireccion) {
    if(d.accion==='PENDIENTE')return undefined;
    if(d.accion==='GUARDAR_DIRECCION'){
        if(!d.estante||!d.archivador)throw new Error('Seleccione estante y archivador');
        return {accion:d.accion,estante_id:d.estante,archivador_id:d.archivador};
    }
    const usuario=d.persona==='usuario'?d.usuario||null:null;
    const nombre=d.persona==='manual'?d.nombre.trim()||null:null;
    if(!d.oficina&&!usuario&&!nombre)throw new Error('Indique oficina o persona');
    return {accion:d.accion,oficina_id:d.oficina||null,usuario_id:usuario,nombre,observaciones:d.observaciones.trim()||null};
}

/** Controles compartidos sin formularios anidados ni confirmaciones adicionales. */
export function DecisionDireccionCampos({valor,onChange,opciones,permitirPendiente=false,prefijo=''}:{
    valor:DecisionDireccion;onChange:(valor:DecisionDireccion)=>void;
    opciones:z.infer<typeof opcionesSchema>|null;permitirPendiente?:boolean;prefijo?:string;
}) {
    const id=(campo:string)=>prefijo+campo;
    const cambiar=(cambios:Partial<DecisionDireccion>)=>onChange({...valor,...cambios});
    const ubicaciones=opciones?.ubicaciones_direccion??[];
    return <>
        {permitirPendiente?<div className={styles.campo}>
            <label htmlFor={id('decision-direccion')}>Destino</label>
            <select id={id('decision-direccion')} value={valor.accion} onChange={e=>cambiar({accion:e.target.value as DecisionDireccion['accion']})}>
                <option value="PENDIENTE">Pendiente de decisión</option><option value="DELEGAR">Delegar</option><option value="GUARDAR_DIRECCION">{opciones?.nombre_guardado??'Guardar en Dirección'}</option>
            </select>
        </div>:<div className={`${styles.acciones} ${documentoStyles.decisiones}`}>
            <button type="button" className={valor.accion==='GUARDAR_DIRECCION'?styles.boton:styles.secundario} aria-pressed={valor.accion==='GUARDAR_DIRECCION'} onClick={()=>cambiar({accion:'GUARDAR_DIRECCION'})}>{opciones?.nombre_guardado??'Guardar en Dirección'}</button>
            <button type="button" className={valor.accion==='DELEGAR'?styles.boton:styles.secundario} aria-pressed={valor.accion==='DELEGAR'} onClick={()=>cambiar({accion:'DELEGAR'})}>Delegar</button>
        </div>}
        {valor.accion==='DELEGAR'&&<div className={styles.datos}>
            <div className={styles.campo}><label htmlFor={id('destino-oficina')}>Oficina</label><select id={id('destino-oficina')} value={valor.oficina} onChange={e=>cambiar({oficina:e.target.value,usuario:''})}><option value="">Sin oficina</option>{opciones?.oficinas.map(o=><option key={o.id} value={o.id}>{o.nombre}</option>)}</select></div>
            <div className={styles.campo}><label htmlFor={id('persona-tipo')}>Persona</label><select id={id('persona-tipo')} value={valor.persona} onChange={e=>cambiar({persona:e.target.value as DecisionDireccion['persona']})}><option value="usuario">Usuario registrado</option><option value="manual">Escribir nombre</option></select></div>
            {valor.persona==='usuario'?<div className={styles.campo}><label htmlFor={id('destino-usuario')}>Usuario</label><select id={id('destino-usuario')} value={valor.usuario} onChange={e=>cambiar({usuario:e.target.value})}><option value="">Sin persona</option>{opciones?.destinatarios.filter(u=>!valor.oficina||u.oficina_id===valor.oficina).map(u=><option key={u.id} value={u.id}>{u.nombre}</option>)}</select></div>:<div className={styles.campo}><label htmlFor={id('destino-nombre')}>Nombre</label><input id={id('destino-nombre')} maxLength={250} value={valor.nombre} onChange={e=>cambiar({nombre:e.target.value})}/></div>}
            <div className={styles.campo}><label htmlFor={id('observaciones-direccion')}>Observaciones de delegación</label><textarea id={id('observaciones-direccion')} maxLength={20000} value={valor.observaciones} onChange={e=>cambiar({observaciones:e.target.value})}/></div>
        </div>}
        {valor.accion==='GUARDAR_DIRECCION'&&<div className={styles.datos}>
            <div className={styles.campo}><label htmlFor={id('estante-direccion')}>Estante</label><select id={id('estante-direccion')} required value={valor.estante} onChange={e=>cambiar({estante:e.target.value,archivador:''})}><option value="">Seleccionar</option>{[...new Map(ubicaciones.map(u=>[u.estante_id,u.estante])).entries()].map(([clave,codigo])=><option key={clave} value={clave}>{codigo}</option>)}</select></div>
            <div className={styles.campo}><label htmlFor={id('archivador-direccion')}>Archivador</label><select id={id('archivador-direccion')} required value={valor.archivador} onChange={e=>cambiar({archivador:e.target.value})}><option value="">Seleccionar</option>{ubicaciones.filter(u=>u.estante_id===valor.estante).map(u=><option key={u.id} value={u.id}>{u.numero}</option>)}</select></div>
        </div>}
    </>;
}
