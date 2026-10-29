import { z } from 'zod';
import { apiRequest } from '../../../api/client';
export const MAX_PDF = 15 * 1024 * 1024;
export const estadoPdfSchema = z.object({ archivo:z.object({ revision:z.string(),nombre:z.string(),tamano:z.number(),cargado_en:z.string() }).nullable(),modificar:z.boolean(),limpieza_pendiente:z.number() });
export type EstadoPdf = z.infer<typeof estadoPdfSchema>;
export type PeticionPdf = <T>(accion:string,datos:unknown,schema:z.ZodType<T>) => Promise<T>;
/** Mantiene la clave SíseVe únicamente durante esta petición; cada fase vuelve a verificarla. */
export function clientePdf(token:string,id:string,clave?:()=>string|Promise<string>,vigente:()=>boolean=()=>true): PeticionPdf {
    return async(accion,datos,schema) => {
        if(!vigente())throw new Error('La operación PDF perdió su contexto; consulte nuevamente.');
        if (clave) {
            const secreto=await clave();
            if(!vigente())throw new Error('La operación PDF perdió su contexto; consulte nuevamente.');
            const r=await apiRequest('/api/siseve/operaciones',z.object({resultado:schema}),{method:'POST',body:JSON.stringify({clave:secreto,operacion:`pdf-${accion}`,id,datos})},token);
            if(!vigente())throw new Error('La operación PDF perdió su contexto; consulte nuevamente.');
            return r.resultado;
        }
        const ruta = accion==='consultar'?'':accion==='iniciar'?'/cargas':`/${accion}`;
        return apiRequest(`/api/documentos/${encodeURIComponent(id)}/pdf${ruta}`,schema,accion==='consultar'?{}:{method:'POST',body:JSON.stringify(datos)},token);
    };
}
/** Validación orientativa; el servidor vuelve a comprobar bytes, tamaño, tipo y estructura. */
export function comprobarSeleccion(file:File) {
    if (!/\.pdf$/i.test(file.name)||file.type!=='application/pdf'||!file.size||file.size>MAX_PDF) throw new Error('Seleccione un PDF válido de hasta 15 MB.');
}
/** La confirmación es independiente del registro; un fallo nunca vuelve a crear el documento. */
export async function subirPdf(pedir:PeticionPdf,file:File,revision:string|null) {
    comprobarSeleccion(file);
    const carga = await pedir('iniciar',{nombre:file.name,tamano:file.size,mime:'application/pdf',revision},z.object({carga:z.string(),url:z.string().url(),headers:z.record(z.string(),z.string())}));
    const r = await fetch(carga.url,{method:'PUT',headers:carga.headers,body:file,credentials:'omit',referrerPolicy:'no-referrer'});
    if (!r.ok) throw new Error('No se pudo subir el PDF. El adjunto anterior se conserva.');
    await pedir('confirmar',{carga:carga.carga},z.object({confirmado:z.boolean()}).or(estadoPdfSchema));
}
