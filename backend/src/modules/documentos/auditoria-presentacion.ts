import { conexionDocumental, tipoVisibleSQL } from '../../shared/documental/contexto.js';

type Grupo = 'usuarios' | 'oficinas' | 'archivadores' | 'tipos' | 'estantes';
const referencias: Record<string,Grupo> = {
    registrado_por_id:'usuarios',responsable_actual_id:'usuarios',destinatario_autorizado_id:'usuarios',
    decision_autorizada_por_id:'usuarios',usuario_actor_id:'usuarios',actor_id:'usuarios',usuario_id:'usuarios',
    usuario_origen_id:'usuarios',usuario_destino_id:'usuarios',decidido_por_id:'usuarios',trasladado_por_id:'usuarios',
    recibido_por_id:'usuarios',rechazado_por_id:'usuarios',cancelado_por_id:'usuarios',devolucion_confirmada_por_id:'usuarios',
    oficina_responsable_id:'oficinas',oficina_destino_autorizada_id:'oficinas',oficina_id:'oficinas',
    oficina_origen_id:'oficinas',oficina_destino_id:'oficinas',archivador_id:'archivadores',tipo_documental_id:'tipos',estante_id:'estantes',
};

/** Añade una proyección legible; conserva sin modificar el JSON original de auditoría. */
export async function presentarAuditoria(filas: {campos_modificados:Record<string,unknown>;[key:string]:unknown}[]) {
    const ids:Record<Grupo,Set<string>>={usuarios:new Set(),oficinas:new Set(),archivadores:new Set(),tipos:new Set(),estantes:new Set()};
    function recoger(valor:unknown,campo:string) {
        if(valor && typeof valor==='object') {
            for(const [k,v] of Object.entries(valor))recoger(v,k==='antes'||k==='despues'?campo:k);
        } else if(referencias[campo] && valor!==null && /^[1-9][0-9]*$/.test(String(valor)))ids[referencias[campo]].add(String(valor));
    }
    for(const f of filas)for(const [k,v] of Object.entries(f.campos_modificados))recoger(v,k);
    const consultas:Record<Grupo,string>={
        usuarios:"SELECT id::text,concat_ws(' ',nombre,apellido) nombre FROM usuarios WHERE id=ANY($1::bigint[])",
        oficinas:'SELECT id::text,nombre FROM oficinas WHERE id=ANY($1::bigint[])',
        archivadores:"SELECT a.id::text,concat(o.nombre,' / Estante ',e.codigo,' / Archivador ',a.numero) nombre FROM archivadores a JOIN estantes e ON e.id=a.estante_id JOIN oficinas o ON o.id=e.oficina_id WHERE a.id=ANY($1::bigint[])",
        tipos:`SELECT td.id::text,td.nombre FROM tipos_documentales td WHERE td.id=ANY($1::bigint[]) AND ${tipoVisibleSQL()}`,
        estantes:"SELECT e.id::text,concat(o.nombre,' / Estante ',e.codigo) nombre FROM estantes e JOIN oficinas o ON o.id=e.oficina_id WHERE e.id=ANY($1::bigint[])",
    };
    const nombres:Record<string,Map<string,string>>={};
    for(const grupo of Object.keys(ids) as Grupo[]) {
        nombres[grupo]=new Map();
        if(ids[grupo].size)for(const r of (await conexionDocumental().query<{id:string;nombre:string}>(consultas[grupo],[[...ids[grupo]]])).rows)nombres[grupo].set(r.id,r.nombre);
    }
    function transformar(valor:unknown,campo:string):unknown {
        if(valor && typeof valor==='object')return Object.fromEntries(Object.entries(valor).filter(([k])=>k!=='id').map(([k,v])=>[k,transformar(v,k==='antes'||k==='despues'?campo:k)]));
        if(valor!==null && referencias[campo])return nombres[referencias[campo]]?.get(String(valor))??'Referencia histórica no disponible';
        return valor;
    }
    return filas.map(f=>({...f,campos_presentacion:transformar(f.campos_modificados,'')}));
}
