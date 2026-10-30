import { useEffect,useRef,useState } from 'react';
import { GlobalWorkerOptions,getDocument,type PDFDocumentProxy,type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import styles from './ArchivoPdf.module.css';
GlobalWorkerOptions.workerSrc=workerUrl;
/** Renderiza páginas sin ejecutar JavaScript ni enlaces del documento; worker servido por Vite. */
export default function VisorPdf({bytes}:{bytes:Uint8Array}) {
    const canvas=useRef<HTMLCanvasElement>(null);
    const [pdf,setPdf]=useState<PDFDocumentProxy>();
    const [pagina,setPagina]=useState(1);
    const [error,setError]=useState('');
    const [cargando,setCargando]=useState(true);
    useEffect(()=>{
        let vigente=true;
        const tarea=getDocument({data:bytes.slice(),enableXfa:false,useSystemFonts:true});
        void tarea.promise.then(doc=>{if(vigente)setPdf(doc);},()=>{if(vigente){setError('No se pudo interpretar el PDF.');setCargando(false);}});
        return()=>{vigente=false;void tarea.destroy();};
    },[bytes]);
    useEffect(()=>{
        if(!pdf||!canvas.current)return;
        let vigente=true;let tarea:RenderTask|undefined;
        const elemento=canvas.current;
        void pdf.getPage(pagina).then(async page=>{
            if(!vigente)return;
            const base=page.getViewport({scale:1});
            const viewport=page.getViewport({scale:Math.min(1.3,2048/base.width,4096/base.height)});
            elemento.width=Math.ceil(viewport.width);elemento.height=Math.ceil(viewport.height);
            tarea=page.render({canvas:elemento,viewport});
            await tarea.promise;
            if(vigente)setCargando(false);
        }).catch(()=>{if(vigente){setError('No se pudo mostrar esta página del PDF.');setCargando(false);}});
        return()=>{vigente=false;tarea?.cancel();};
    },[pdf,pagina]);
    return <div className={styles.visor}>
        <nav className={styles.paginas} aria-label="Páginas del PDF">
            <button type="button" disabled={!pdf||pagina===1} onClick={()=>{setCargando(true);setPagina(n=>n-1);}}>Anterior</button>
            <span aria-live="polite">Página {pagina} de {pdf?.numPages??'…'}</span>
            <button type="button" disabled={!pdf||pagina>=pdf.numPages} onClick={()=>{setCargando(true);setPagina(n=>n+1);}}>Siguiente</button>
        </nav>
        {cargando&&<p role="status">Mostrando PDF…</p>}
        {error&&<p role="alert">{error}</p>}
        <div className={styles.papel}><canvas ref={canvas} aria-label={`Página ${pagina} del documento PDF`}/></div>
    </div>;
}
