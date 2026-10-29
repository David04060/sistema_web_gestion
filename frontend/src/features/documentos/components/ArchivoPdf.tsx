import { useEffect,useRef,useState } from 'react';
import { z } from 'zod';
import { clientePdf,estadoPdfSchema,subirPdf,type EstadoPdf } from '../api/pdf.api';
import styles from '../../../components/ui/Admin.module.css';
import { fechaLocal } from '../../../lib/fechas';
/** Consulta y modificaciones separadas; SíseVe pide una clave nueva para cada fase. */
export function ArchivoPdf({token,id,restringido=false}:{token:string;id:string;restringido?:boolean}) {
    const [estado,setEstado]=useState<EstadoPdf>();
    const [ocupado,setOcupado]=useState(false);
    const [error,setError]=useState(''); const [mensaje,setMensaje]=useState('');
    const [archivo,setArchivo]=useState<File|null>(null);
    const [solicitaClave,setSolicitaClave]=useState(false);
    const [clave,setClave]=useState('');
    const resolverClave=useRef<((valor:string)=>void)|null>(null);
    const contexto=useRef(0);
    const contextoOperacion=useRef(0);
    useEffect(()=>{
        let vigente=true;
        if(!restringido)clientePdf(token,id)('consultar',{},estadoPdfSchema).then(r=>{if(vigente)setEstado(r);},e=>{if(vigente)setError(e instanceof Error?e.message:'No se pudo consultar el PDF');});
        const ocultar=()=>{if(restringido&&document.hidden){contexto.current++;setEstado(undefined);setClave('');setMensaje('');setArchivo(null);resolverClave.current?.('');resolverClave.current=null;setSolicitaClave(false);}};
        document.addEventListener('visibilitychange',ocultar);
        return()=>{vigente=false;contexto.current++;document.removeEventListener('visibilitychange',ocultar);resolverClave.current?.('');};
    },[token,id,restringido]);
    const pedir=clientePdf(token,id,restringido?async()=>{setClave('');setSolicitaClave(true);const valor=await new Promise<string>(resolve=>{resolverClave.current=resolve;});if(!valor)throw new Error('Operación cancelada');return valor;}:undefined,()=>contexto.current===contextoOperacion.current&&(!restringido||!document.hidden));
    async function ejecutar(operacion:()=>Promise<void>) {
        contextoOperacion.current=contexto.current;
        setOcupado(true);setError('');setMensaje('');
        try {await operacion();}catch(e){if(restringido)setEstado(undefined);setError(e instanceof Error?e.message:'No se pudo completar la operación');}finally{setOcupado(false);}
    }
    async function consultar(){setEstado(await pedir('consultar',{},estadoPdfSchema));}
    async function cargar(){
        if(!archivo||!estado)return;
        if(estado.archivo&&!window.confirm('¿Reemplazar el PDF? Se eliminará físicamente el anterior y no podrá recuperarse.'))return;
        await subirPdf(pedir,archivo,estado.archivo?.revision??null);
        setArchivo(null);
        setMensaje('Nuevo PDF confirmado.');
        await consultar();
    }
    async function eliminar(){
        if(!estado?.archivo||!window.confirm('¿Eliminar permanentemente el PDF adjunto? El registro documental se conservará.'))return;
        await pedir('eliminar',{revision:estado.archivo.revision,confirmar:true},z.object({confirmado:z.boolean()}).or(estadoPdfSchema));
        await consultar();setMensaje('PDF desvinculado. Consulte el estado de eliminación física indicado debajo.');
    }
    async function abrir(descargar:boolean){
        // Reservar la pestaña dentro del clic evita que Chrome bloquee la apertura tras esperar a la API.
        const ventana=window.open('about:blank','_blank');
        if(!ventana)throw new Error('Permita abrir la pestaña del PDF en su navegador y vuelva a intentarlo.');
        ventana.opener=null;
        try {
        const r=await pedir('abrir',{descargar},z.object({url:z.string().url(),vence_en:z.number()}));
        const politica=ventana.document.createElement('meta');politica.name='referrer';politica.content='no-referrer';ventana.document.head.appendChild(politica);
        ventana.location.replace(r.url);
        } catch(error) { ventana.close();throw error; }
    }
    return <section className={styles.tarjeta} aria-busy={ocupado}>
        <h2>Archivo PDF</h2>
        {solicitaClave&&<form onSubmit={e=>{e.preventDefault();resolverClave.current?.(clave);resolverClave.current=null;setClave('');setSolicitaClave(false);}}><label>Contraseña SíseVe para esta operación<input type="password" autoComplete="off" value={clave} onChange={e=>setClave(e.target.value)} required maxLength={1024}/></label><button type="submit">Verificar y continuar</button><button type="button" onClick={()=>{resolverClave.current?.('');resolverClave.current=null;setClave('');setSolicitaClave(false);}}>Cancelar</button></form>}
        {!estado?<button type="button" disabled={ocupado} onClick={()=>void ejecutar(consultar)}>Consultar archivo PDF</button>:<>
            {estado.archivo?<><p>{estado.archivo.nombre} · {(estado.archivo.tamano/1024/1024).toFixed(2)} MB · {fechaLocal(estado.archivo.cargado_en)}</p><div className={styles.acciones}><button type="button" disabled={ocupado} onClick={()=>void ejecutar(()=>abrir(false))}>Visualizar</button><button type="button" disabled={ocupado} onClick={()=>void ejecutar(()=>abrir(true))}>Descargar</button></div></>:<p>Sin PDF adjunto</p>}
            {estado.modificar&&<><label>PDF (máximo 15 MB)<input type="file" accept="application/pdf,.pdf" disabled={ocupado} onChange={e=>setArchivo(e.target.files?.[0]??null)}/></label><div className={styles.acciones}><button type="button" disabled={ocupado||!archivo} onClick={()=>void ejecutar(cargar)}>{estado.archivo?'Reemplazar PDF':'Adjuntar PDF'}</button>{estado.archivo&&<button type="button" disabled={ocupado} onClick={()=>void ejecutar(eliminar)}>Eliminar PDF</button>}</div></>}
            {estado.limpieza_pendiente>0?<p role="status">Eliminación física pendiente. El mantenimiento debe reintentar la limpieza; todavía no se considera completada.</p>:<p>No hay eliminaciones físicas pendientes.</p>}
            <button type="button" disabled={ocupado} onClick={()=>void ejecutar(consultar)}>Actualizar archivo PDF</button>
        </>}
        {ocupado&&<p role="status">Procesando PDF…</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}{mensaje&&<p role="status">{mensaje}</p>}
    </section>;
}
