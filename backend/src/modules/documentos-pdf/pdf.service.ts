import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { PoolClient } from 'pg';
import { pool } from '../../config/database.js';
import { obtenerActor, transaccionDocumental, type ActorDocumental } from '../../shared/documental/transaccion.js';
import { conexionDocumental, clienteDocumental } from '../../shared/documental/contexto.js';
import { puedeGestionarPdfInstitucional, type DecisionPdf } from './pdf.permissions.js';
import * as documentos from '../documentos/documentos.service.js';
import * as documentosRepo from '../documentos/documentos.repository.js';
import { HttpError } from '../../shared/http/HttpError.js';
import { crearAlmacenR2, prefijoPdf, type AlmacenPdf } from './pdf.storage.js';
import type { iniciarSchema } from './pdf.schema.js';
import * as repo from './pdf.repository.js';

/** Instancia por operación; las pruebas inyectan almacenamiento sin conectar a R2. */
export function servicioPdf(almacen: () => AlmacenPdf = crearAlmacenR2) {
    async function exigirGestion(actor: ActorDocumental,d: documentosRepo.Documento,c: PoolClient) {
        if (!clienteDocumental() && d.registro_personal && d.responsable_actual_id!==actor.id)
            throw new HttpError(403,'La consulta institucional no permite modificar este PDF');
        if (clienteDocumental() || !['Director(a)','Secretaria de Dirección'].includes(actor.rol)) {
            await documentos.exigirEditable(actor,d,c); return;
        }
        const decision=(await c.query<DecisionPdf>('SELECT situacion,tipo,usuario_id::text FROM entregas_secretaria WHERE documento_id=$1',[d.id])).rows[0];
        if (!puedeGestionarPdfInstitucional(actor,d,decision)) throw new HttpError(403,'No tiene permiso para gestionar el PDF de este documento');
        if (await documentosRepo.movimientoAbierto(d.id,c)) throw new HttpError(409,'Existe una circulación física abierta');
    }
    async function consultar(actorId: string, id: string) {
        const actor = await obtenerActor(actorId);
        const d = await documentosRepo.obtenerParaPdf(actor, id);
        if (!d) throw new HttpError(404, 'Documento inexistente o no autorizado');
        let modificar = d.activo && ['RECIBIDO','PENDIENTE_DECISION'].includes(d.estado_tramite);
        if (modificar) {
            // Misma autoría/custodia/circulación que las escrituras, sin ampliar permisos por oficina.
            try { await exigirGestion(actor, d, conexionDocumental() as PoolClient); }
            catch (e) { if (e instanceof HttpError && [403,409].includes(e.status)) modificar = false; else throw e; }
        }
        const p = await repo.vigente(id);
        return { archivo: p ? { revision:p.revision,nombre:p.nombre,tamano:p.tamano,cargado_en:p.cargado_en } : null, modificar, limpieza_pendiente: await repo.pendientes(id) };
    }
    async function editable(c: PoolClient, actor: ActorDocumental, id: string) {
        await documentosRepo.bloquear(id,c);
        const d = await documentosRepo.obtenerParaPdf(actor,id,c);
        if (!d) throw new HttpError(404,'Documento inexistente o no autorizado');
        if (!d.activo) throw new HttpError(409,'El documento está anulado');
        await exigirGestion(actor,d,c);
        if (!['RECIBIDO','PENDIENTE_DECISION'].includes(d.estado_tramite)) throw new HttpError(409, 'Estado documental incompatible');
    }
    async function iniciar(actorId: string, id: string, datos: z.infer<typeof iniciarSchema>) {
        const {carga,storage} = await transaccionDocumental(actorId,'Preparar PDF',async(c,actor) => {
            await editable(c,actor,id);
            if ((await repo.vigente(id,c))?.revision !== (datos.revision ?? undefined)) throw new HttpError(409,'El PDF cambió; actualice el detalle');
            const n = Number((await c.query('SELECT count(*) n FROM pdf_cargas WHERE actor_id=$1 AND NOT confirmado AND vence>clock_timestamp()', [actorId])).rows[0].n);
            if (n >= 3) throw new HttpError(429,'Hay cargas pendientes; espere su vencimiento');
            const prefijo = prefijoPdf();
            const carga: repo.Carga = { id:randomUUID(),documento_id:id,actor_id:actorId,temporal:`${prefijo}tmp/${randomUUID()}`,definitiva:`${prefijo}pdf/${randomUUID()}`,nombre:datos.nombre,tamano:datos.tamano,revision:datos.revision,vence:new Date(Date.now()+10*60_000),confirmado:false };
            await repo.crear(c,carga); return {carga,storage:almacen()};
        });
        return { carga:carga.id, url:await storage.subir(carga.temporal,carga.tamano), headers:{ 'Content-Type':'application/pdf', 'If-None-Match':'*' } };
    }
    async function confirmar(actorId: string,id: string,cargaId: string) {
        return transaccionDocumental(actorId,'Confirmar PDF',async(c,actor) => {
            await editable(c,actor,id);
            const carga = await repo.carga(c,cargaId,id,actorId);
            if (!carga) throw new HttpError(404,'Carga inexistente');
            const anterior = await repo.vigente(id,c);
            if (carga.confirmado && anterior?.revision===carga.id) return { confirmado:true };
            if (carga.confirmado || new Date(carga.vence).getTime() <= Date.now() || (anterior?.revision ?? null)!==carga.revision) throw new HttpError(409,'La carga venció o el PDF cambió');
            // Comparte el bloqueo con el recolector incluso si una copia tarda más que el vencimiento.
            await c.query('SELECT clave FROM pdf_objetos WHERE clave IN ($1,$2) FOR UPDATE',[carga.temporal,carga.definitiva]);
            await almacen().validarYCopiar(carga.temporal,carga.definitiva,carga.tamano);
            await repo.vincular(c,carga);
            if (anterior) await repo.programar(c,anterior.clave);
            await repo.evento(c,id,actorId,anterior?'REEMPLAZO':'CARGA',carga.id);
            return { confirmado:true };
        });
    }
    async function eliminar(actorId: string,id: string,revision: string) {
        return transaccionDocumental(actorId,'Eliminar PDF',async(c,actor) => {
            await editable(c,actor,id);
            const p = await repo.vigente(id,c);
            if (!p || p.revision!==revision) throw new HttpError(409,'El PDF cambió; actualice el detalle');
            await repo.retirar(c,id); await repo.programar(c,p.clave); await repo.evento(c,id,actorId,'ELIMINACION',revision);
            return { confirmado:true };
        });
    }
    async function abrir(actorId: string,id: string,descargar: boolean) {
        await consultar(actorId,id);
        const p = await repo.vigente(id);
        if (!p) throw new HttpError(404,'Sin PDF adjunto');
        return { url:await almacen().abrir(p.clave,p.nombre,descargar), vence_en:60 };
    }
    return { consultar,iniciar,confirmar,eliminar,abrir };
}
export const pdf = servicioPdf();

/** Trabaja SOLO después del commit. SKIP LOCKED coordina reintentos; los fallos mantienen la tarea durable.
 * Las tumbas temporales se retienen para reintentar sin reutilizar una URL PUT aún vigente.
 */
export async function limpiarPdf(limite = 20, documentoId?: string, almacen: () => AlmacenPdf = crearAlmacenR2) {
    const c = await pool.connect(); let pendientes = 0; let eliminados = 0;
    try {
        await c.query('BEGIN');
        const objetos = (await c.query<{clave:string;documento_id:string}>(`SELECT o.clave,o.documento_id::text FROM pdf_objetos o
            WHERE o.eliminado_en IS NULL AND o.limpiar_desde<=clock_timestamp() AND ($2::bigint IS NULL OR o.documento_id=$2)
            AND NOT EXISTS(SELECT 1 FROM documentos_pdf p WHERE p.clave=o.clave)
            ORDER BY EXISTS(SELECT 1 FROM pdf_cargas c WHERE c.definitiva=o.clave AND c.confirmado) DESC,
                o.limpiar_desde LIMIT $1 FOR UPDATE OF o SKIP LOCKED`,[limite,documentoId??null])).rows;
        for (const o of objetos) {
            try {
                await almacen().eliminar(o.clave);
                await c.query('UPDATE pdf_objetos SET eliminado_en=clock_timestamp(),intentos=intentos+1 WHERE clave=$1',[o.clave]);
                await repo.evento(c,o.documento_id,null,'LIMPIEZA_COMPLETADA'); eliminados++;
            } catch {
                await c.query("UPDATE pdf_objetos SET intentos=intentos+1,limpiar_desde=clock_timestamp()+interval '1 minute' WHERE clave=$1",[o.clave]);
                await repo.evento(c,o.documento_id,null,'LIMPIEZA_PENDIENTE'); pendientes++;
            }
        }
        await c.query('COMMIT'); return { eliminados,pendientes };
    } catch (e) { await c.query('ROLLBACK'); throw e; }
    finally { c.release(); }
}
