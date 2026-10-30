import { lazy,Suspense,useEffect,useRef,useState } from 'react';
import { z } from 'zod';
import { clientePdf,estadoPdfSchema,subirPdf,obtenerContenidoPdf,comprobarSeleccion,type EstadoPdf } from '../api/pdf.api';
import styles from '../../../components/ui/Admin.module.css';
const VisorPdf=lazy(()=>import('./VisorPdf'));
import pdfStyles from './ArchivoPdf.module.css';
/** Consulta y modificaciones separadas; SíseVe pide una clave nueva para cada fase. */
export function ArchivoPdf({token,id,restringido=false}:{token:string;id:string;restringido?:boolean}) {
    const [estado,setEstado]=useState<EstadoPdf>();
    const [ocupado,setOcupado]=useState(false);
    const [error,setError]=useState(''); const [mensaje,setMensaje]=useState('');
    const selector=useRef<HTMLInputElement>(null);
    const [bytes,setBytes]=useState<Uint8Array>();
    const [seleccion,setSeleccion]=useState<{archivo:File;bytes:Uint8Array;revision:string|null}>();
    const [solicitaClave,setSolicitaClave]=useState(false);
    const [clave,setClave]=useState('');
    const resolverClave=useRef<((valor:string)=>void)|null>(null);
    const contexto=useRef(0);
    const contextoOperacion=useRef(0);
    useEffect(()=>{
        let vigente=true;
        if(!restringido)clientePdf(token,id)('consultar',{},estadoPdfSchema).then(r=>{if(vigente)setEstado(r);},e=>{if(vigente)setError(e instanceof Error?e.message:'No se pudo consultar el PDF');});
        const ocultar=()=>{if(restringido&&document.hidden){contexto.current++;setEstado(undefined);setClave('');setMensaje('');setBytes(undefined);setSeleccion(undefined);resolverClave.current?.('');resolverClave.current=null;setSolicitaClave(false);}};
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
    async function previsualizar(archivo:File){
        comprobarSeleccion(archivo);
        const generacion=contexto.current;
        const contenido=new Uint8Array(await archivo.arrayBuffer());
        if(generacion!==contexto.current)throw new Error('La selección perdió su contexto.');
        setSeleccion({archivo,bytes:contenido,revision:estado?.archivo?.revision??null});
    }
    async function cargar(){
        if(!estado||!seleccion)return;
        await subirPdf(pedir,seleccion.archivo,seleccion.revision);
        setSeleccion(undefined);
        setBytes(undefined);
        setMensaje('Nuevo PDF confirmado.');
        await consultar();
    }
    async function eliminar(){
        if(!estado?.archivo||!window.confirm('¿Eliminar permanentemente el PDF adjunto? El registro documental se conservará.'))return;
        await pedir('eliminar',{revision:estado.archivo.revision,confirmar:true},z.object({confirmado:z.boolean()}).or(estadoPdfSchema));
        setBytes(undefined);await consultar();setMensaje('PDF desvinculado. Consulte el estado de eliminación física indicado debajo.');
    }
    async function abrir(descargar:boolean){
        const generacion=contexto.current;
        const r=await pedir('abrir',{descargar},z.object({url:z.string().url(),vence_en:z.number()}));
        const contenido=await obtenerContenidoPdf(r.url,()=>generacion===contexto.current&&(!restringido||!document.hidden));
        if(descargar){
            const url=URL.createObjectURL(new Blob([contenido],{type:'application/pdf'}));
            const enlace=document.createElement('a');enlace.href=url;enlace.download=estado?.archivo?.nombre??'documento.pdf';
            document.body.appendChild(enlace);enlace.click();enlace.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
        }else setBytes(contenido);
    }
    return <section className={`${styles.tarjeta} ${pdfStyles.archivo}`} aria-busy={ocupado}>
        <h2>Archivo PDF</h2>
        {solicitaClave&&<form onSubmit={e=>{e.preventDefault();resolverClave.current?.(clave);resolverClave.current=null;setClave('');setSolicitaClave(false);}}><label>Contraseña SíseVe para esta operación<input type="password" autoComplete="off" value={clave} onChange={e=>setClave(e.target.value)} required maxLength={1024}/></label><button type="submit">Verificar y continuar</button><button type="button" onClick={()=>{resolverClave.current?.('');resolverClave.current=null;setClave('');setSolicitaClave(false);}}>Cancelar</button></form>}
        <input ref={selector} className={pdfStyles.selectorOculto} type="file" accept="application/pdf,.pdf" disabled={ocupado}
            aria-label={estado?.archivo?'Seleccionar nuevo PDF':'Seleccionar PDF para subir'}
            onChange={e=>{const archivo=e.target.files?.[0];e.target.value='';if(archivo)void ejecutar(()=>previsualizar(archivo));}}/>
        {seleccion?<>
            <h3>Previsualización: {seleccion.archivo.name}</h3>
            <p>El archivo todavía no se ha subido.{seleccion.revision?' Al confirmar se reemplazará el PDF vigente y se eliminará el anterior.':''}</p>
            <div className={pdfStyles.herramientas}>
                <button type="button" disabled={ocupado} onClick={()=>void ejecutar(cargar)}>{seleccion.revision?'Confirmar reemplazo':'Confirmar subida'}</button>
                <button type="button" disabled={ocupado} onClick={()=>setSeleccion(undefined)}>Cancelar</button>
            </div>
            <Suspense fallback={<p role="status">Preparando previsualización…</p>}><VisorPdf bytes={seleccion.bytes}/></Suspense>
        </>:!estado?(error||restringido)&&<button type="button" disabled={ocupado} onClick={()=>void ejecutar(consultar)}>Consultar archivo PDF</button>:<>
            {bytes&&estado.archivo?<>
                <header className={pdfStyles.cabecera}>
                    <button type="button" disabled={ocupado} onClick={()=>setBytes(undefined)}>Volver al documento</button>
                    <h3>{estado.archivo.nombre}</h3>
                </header>
                <div className={pdfStyles.herramientas} aria-label="Acciones del archivo PDF">
                    <button type="button" disabled={ocupado} onClick={()=>void ejecutar(()=>abrir(true))}>Descargar PDF</button>
                    {estado.modificar&&<>
                        <button type="button" disabled={ocupado} onClick={()=>selector.current?.click()}>Actualizar PDF</button>
                        <button type="button" className={pdfStyles.peligro} disabled={ocupado} onClick={()=>void ejecutar(eliminar)}>Eliminar PDF</button>
                    </>}
                </div>
                <Suspense fallback={<p role="status">Preparando visor PDF…</p>}><VisorPdf bytes={bytes}/></Suspense>
            </>:estado.archivo?<div className={pdfStyles.resumen}>
                <p>{estado.archivo.nombre}</p>
                <button type="button" disabled={ocupado} onClick={()=>void ejecutar(()=>abrir(false))}>Visualizar archivo PDF</button>
            </div>:<>
                <p>Sin PDF adjunto</p>
                {estado.modificar&&<button type="button" disabled={ocupado} onClick={()=>selector.current?.click()}>Subir archivo PDF</button>}
            </>}
            {estado.limpieza_pendiente>0&&<p role="status">Eliminación física pendiente. El mantenimiento reintentará la limpieza.</p>}
        </>}
        {ocupado&&<p role="status">Procesando PDF…</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}{mensaje&&<p role="status">{mensaje}</p>}
    </section>;
}
