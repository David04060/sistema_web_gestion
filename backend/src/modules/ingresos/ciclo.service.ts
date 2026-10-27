import type { PoolClient } from 'pg';
import { obtenerActor, transaccionDocumental, type ActorDocumental } from '../../shared/documental/transaccion.js';
import { HttpError } from '../../shared/http/HttpError.js';
import * as documentos from '../documentos/documentos.repository.js';
import * as repository from './ingresos.repository.js';
import type { Presentacion } from './ingresos.schema.js';

function exigirCapacidad() {
    if (!repository.cicloHabilitado()) throw new HttpError(409, 'El ciclo ordinario de ingresos no está habilitado');
}
async function contexto(actor: ActorDocumental, id: string, c: PoolClient) {
    if (actor.rol === 'Administrador') throw new HttpError(403, 'El Administrador no consulta ni opera ingresos documentales');
    const d = await documentos.obtener(actor,id,c);
    if (!d) throw new HttpError(404, 'Documento inexistente o no autorizado');
    const secretaria = actor.rol === 'Secretaria de Dirección' && actor.oficina_id !== null
        && await documentos.oficinaNombre(actor.oficina_id,c) === 'Mesa de Partes';
    return { d, secretaria, custodio: d.activo && d.responsable_actual_id===actor.id && d.oficina_responsable_id===actor.oficina_id };
}
async function libre(id: string, c: PoolClient) {
    if (!(await c.query('SELECT public.fn_mp_original_libre($1) libre',[id])).rows[0].libre)
        throw new HttpError(409, 'Hay circulación, recuperación, autorización de salida u otra operación incompatible sobre el original');
}
async function abierto(id: string, ingreso: string, c: PoolClient) {
    const i = await repository.bloquearIngreso(id,ingreso,c);
    if (!i) throw new HttpError(404, 'Ingreso inexistente o no autorizado');
    if (i.fecha_conclusion || i.fecha_invalidacion) throw new HttpError(409, 'El ingreso ya tiene un desenlace; consulte su historia');
    return i;
}
/** Lectura paginada con el mismo alcance documental antes de contar o devolver hechos. */
export async function historia(actorId: string, id: string, pagina: number, limite: number) {
    exigirCapacidad(); const actor=await obtenerActor(actorId);
    return repository.lectura(actor, async c => {
        const ctx=await contexto(actor,id,c!);
        const ingreso=await repository.obtener(actor,id,c!);
        return { ingreso, ...await repository.historia(id,pagina,limite,c!), capacidades: { ciclo_ordinario: true,
            continuar: !!ingreso && (ctx.secretaria || ctx.custodio), evidencia: !!ingreso && ctx.custodio,
            concluir: !!ingreso && ctx.secretaria, invalidar: !!ingreso && ctx.secretaria,
            reingresar: !ingreso && ctx.secretaria && ctx.custodio, relevos: false, sustituciones: false } };
    });
}
export async function actuaciones(actorId: string, id: string, ingreso: string, pagina: number, limite: number) {
    exigirCapacidad(); const actor=await obtenerActor(actorId);
    return repository.lectura(actor, async c => {
        await contexto(actor,id,c!);
        if (!(await c!.query('SELECT 1 FROM ingresos_mesa_partes WHERE id=$1 AND documento_id=$2',[ingreso,id])).rowCount)
            throw new HttpError(404,'Ingreso inexistente o no autorizado');
        return repository.actuaciones(ingreso,pagina,limite,c!);
    });
}
/** Una actuación nunca cambia documento, custodia, ubicación o movimiento. */
export async function actuar(actorId: string, id: string, ingreso: string, descripcion: string, evidencia: boolean) {
    exigirCapacidad();
    return transaccionDocumental(actorId, evidencia?'Confirmación del resultado y tenencia del original':'Continuación del ingreso',async(c,actor)=>{
        await documentos.bloquear(id,c); const ctx=await contexto(actor,id,c); await abierto(id,ingreso,c);
        if (evidencia ? !ctx.custodio : !(ctx.secretaria || ctx.custodio)) throw new HttpError(403,'La participación histórica no concede escritura');
        if (evidencia) await libre(id,c);
        return { actuacion: await repository.agregarActuacion(actor,id,ingreso,descripcion,evidencia,c) };
    });
}
/** Revalida evidencia después de los bloqueos; SQL comprueba también la versión al actualizar. */
export async function cerrar(actorId: string, id: string, ingreso: string, motivo: string, evidencia: string | null) {
    exigirCapacidad();
    return transaccionDocumental(actorId,motivo,async(c,actor)=>{
        await documentos.bloquear(id,c); const ctx=await contexto(actor,id,c); await abierto(id,ingreso,c);
        if (!ctx.secretaria) throw new HttpError(403,'Solo Secretaría de Mesa de Partes formaliza el desenlace');
        await libre(id,c);
        if (evidencia && !(await c.query(`SELECT 1 FROM ingresos_actuaciones a JOIN documentos d ON d.id=$3
            WHERE a.id=$1 AND a.ingreso_id=$2 AND a.tipo='EVIDENCIA_RESULTADO' AND a.version_documental=d.xmin::text
            AND a.custodio_id=d.responsable_actual_id AND a.oficina_id=d.oficina_responsable_id`,[evidencia,ingreso,id])).rowCount)
            throw new HttpError(409,'La evidencia ya no acredita la custodia vigente; solicite una nueva confirmación');
        await repository.cerrar(actor,ingreso,motivo,evidencia,c);
        return { documento_id:id, ingreso_id:ingreso, desenlace:evidencia?'CONCLUIDO':'INVALIDADO' };
    });
}
/** Presentación actual en Mesa sin inventar traslado ni reutilizar una recepción antigua. */
export async function reingresar(actorId: string, id: string, anterior: string, datos: Presentacion & { movimiento_recepcion_id?: string }) {
    exigirCapacidad();
    return transaccionDocumental(actorId,'Nueva presentación: '+datos.proposito,async(c,actor)=>{
        await documentos.bloquear(id,c); const ctx=await contexto(actor,id,c);
        if (!ctx.secretaria || !ctx.custodio) throw new HttpError(403,'La nueva presentación exige tenencia actual de Secretaría; confirme antes la recepción física');
        await libre(id,c);
        const ultimo=(await c.query(`SELECT id::text,fecha_conclusion,fecha_invalidacion FROM ingresos_mesa_partes
            WHERE documento_id=$1 ORDER BY id DESC LIMIT 1 FOR UPDATE`,[id])).rows[0];
        if (!ultimo || ultimo.id!==anterior || (!ultimo.fecha_conclusion && !ultimo.fecha_invalidacion))
            throw new HttpError(409,'Debe indicar el último ingreso concluido o invalidado, sin otro ingreso abierto');
        if (datos.movimiento_recepcion_id && !(await c.query(`SELECT 1 FROM movimientos_documentales m WHERE m.id=$1
            AND m.documento_id=$2 AND m.estado='RECIBIDO' AND m.recibido_por_id=$3
            AND m.fecha_recepcion>coalesce($4::timestamptz,$5::timestamptz)
            AND m.id=(SELECT max(id) FROM movimientos_documentales WHERE documento_id=$2)
            AND NOT EXISTS(SELECT 1 FROM ingresos_mesa_partes WHERE movimiento_recepcion_id=m.id)`,
            [datos.movimiento_recepcion_id,id,actor.id,ultimo.fecha_conclusion,ultimo.fecha_invalidacion])).rowCount)
            throw new HttpError(409,'Esa recepción no acredita una nueva entrega posterior');
        // Reconoce una entrega nueva posterior al desenlace; nunca una recepción antigua.
        const recepcion = datos.movimiento_recepcion_id ?? (await c.query(`SELECT m.id::text FROM movimientos_documentales m
            WHERE m.documento_id=$1 AND m.estado='RECIBIDO' AND m.recibido_por_id=$2
            AND m.fecha_recepcion>coalesce($3::timestamptz,$4::timestamptz)
            AND m.id=(SELECT max(id) FROM movimientos_documentales WHERE documento_id=$1)
            AND NOT EXISTS(SELECT 1 FROM ingresos_mesa_partes WHERE movimiento_recepcion_id=m.id)
            AND NOT EXISTS(SELECT 1 FROM movimientos_ingresos WHERE movimiento_id=m.id)`,
            [id,actor.id,ultimo.fecha_conclusion,ultimo.fecha_invalidacion])).rows[0]?.id;
        const ingreso=await repository.reingresar(actor,id,anterior,{...datos,...(recepcion ? {movimiento_recepcion_id:recepcion} : {})},c);
        if (ctx.d.estado_tramite!=='PENDIENTE_DECISION') await documentos.solicitarDecision(id,c);
        return { documento_id:id, ingreso_id:ingreso.id };
    });
}

export async function auditoria(actorId: string,id: string,pagina: number,limite: number) {
    exigirCapacidad(); const actor=await obtenerActor(actorId);
    return repository.lectura(actor,async c=>{await contexto(actor,id,c!);return repository.auditoria(id,pagina,limite,c!);});
}
