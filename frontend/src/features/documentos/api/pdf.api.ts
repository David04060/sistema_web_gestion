import { z } from 'zod';
import { apiRequest } from '../../../api/client';
export const MAX_PDF = 15 * 1024 * 1024;
export const estadoPdfSchema = z.object({ archivo:z.object({ revision:z.uuid(),nombre:z.string(),tamano_bytes:z.number().int().positive(),actualizado_en:z.string() }).nullable(),modificar:z.boolean(),limpieza_pendiente:z.number() }).transform(v=>({...v,archivo:v.archivo?{revision:v.archivo.revision,nombre:v.archivo.nombre,tamano:v.archivo.tamano_bytes,cargado_en:v.archivo.actualizado_en}:null}));
export type EstadoPdf = z.infer<typeof estadoPdfSchema>;
export type PeticionPdf = <T>(accion:string,datos:unknown,schema:z.ZodType<T>) => Promise<T>;
/** Lee el objeto privado sin credenciales institucionales y descarta respuestas de un contexto vencido. */
export async function obtenerContenidoPdf(url:string,vigente:()=>boolean):Promise<Uint8Array<ArrayBuffer>> {
    const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'});
    if(!response.ok)throw new Error('No se pudo obtener el PDF. Vuelva a intentarlo.');
    if(Number(response.headers.get('content-length'))>MAX_PDF)throw new Error('El PDF supera el tamaño permitido.');
    const contenido=new Uint8Array(await response.arrayBuffer());
    if(!vigente())throw new Error('La operación PDF perdió su contexto; consulte nuevamente.');
    if(!contenido.length||contenido.length>MAX_PDF)throw new Error('El PDF tiene un tamaño inválido.');
    return contenido;
}
/** Revalida el contexto en cada fase; no utiliza el circuito restringido retirado. */
export function clientePdf(token:string,id:string,clave?:()=>string|Promise<string>,vigente:()=>boolean=()=>true): PeticionPdf {
    return async(accion,datos,schema) => {
        if(!vigente())throw new Error('La operación PDF perdió su contexto; consulte nuevamente.');
        if (clave) throw new Error('El circuito restringido fue retirado del sistema.');
        const ruta = accion==='consultar'?'':accion==='iniciar'?'/cargas':`/${accion}`;
        const resultado=await apiRequest(`/api/documentos/${encodeURIComponent(id)}/pdf${ruta}`,schema,accion==='consultar'?{}:{method:'POST',body:JSON.stringify(datos)},token);
        if(!vigente())throw new Error('La operación PDF perdió su contexto; consulte nuevamente.');
        return resultado;
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
