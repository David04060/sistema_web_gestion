import * as ciclo from './ciclo.service.js';
import type { PoolClient } from 'pg';
import { obtenerActor, transaccionDocumental, type ActorDocumental } from '../../shared/documental/transaccion.js';
import { HttpError } from '../../shared/http/HttpError.js';
import * as documentos from '../documentos/documentos.repository.js';
import * as pertenencia from '../documentos/pertenencia.repository.js';
import * as movimientos from '../movimientos/movimientos.repository.js';
import * as repository from './ingresos.repository.js';
import type { Presentacion, Externo } from './ingresos.schema.js';

async function exigirSecretaria(actor: ActorDocumental, c?: PoolClient) {
    if (!repository.habilitado()) throw new HttpError(409, 'El primer ingreso ordinario no está habilitado');
    if (actor.rol !== 'Secretaria de Dirección' || !actor.oficina_id
        || await documentos.oficinaNombre(actor.oficina_id, c!) !== 'Mesa de Partes')
        throw new HttpError(403, 'Solo Secretaría de Mesa de Partes registra el primer ingreso ordinario');
}
function validarFecha(datos: Presentacion) {
    if (datos.fecha_presentacion && Date.parse(datos.fecha_presentacion) > Date.now())
        throw new HttpError(400, 'La presentación no puede tener una fecha futura');
}

export async function consultar(actorId: string, documento: string, pagina = 1, limite = 10) {
    if (repository.cicloHabilitado()) return ciclo.historia(actorId,documento,pagina,limite);
    if (!repository.habilitado()) throw new HttpError(409, 'El primer ingreso ordinario no está habilitado');
    const actor = await obtenerActor(actorId);
    if (actor.rol === 'Administrador') throw new HttpError(403, 'El perfil administrativo no consulta ingresos documentales');
    return repository.lectura(actor, async c => {
        if (!await documentos.obtener(actor, documento, c)) throw new HttpError(404, 'Documento inexistente o no autorizado');
        return { ingreso: await repository.obtener(actor, documento, c!) };
    });
}

export async function recepcion(actorId: string, id: string) {
    const actor = await obtenerActor(actorId);
    return repository.lectura(actor, async c => {
        await exigirSecretaria(actor, c);
        const entrega = await repository.recepcion(actor, id, c!);
        if (!entrega) throw new HttpError(404, 'Entrega inexistente o no habilitada para Mesa de Partes');
        if (await repository.existe(entrega.documento_id, c!)) throw new HttpError(409, 'El documento ya tiene un ingreso; esta etapa solo permite la primera presentación');
        return { entrega };
    });
}

/** Recepción e ingreso son una única unidad de trabajo; la recepción ordinaria sigue independiente. */
export async function incorporar(actorId: string, movimientoId: string, datos: Presentacion & { archivador_id?: string | null }, recibir: boolean) {
    validarFecha(datos);
    const documento = await transaccionDocumental(actorId, 'Primer ingreso ordinario por Mesa de Partes', async (c, actor) => {
        await exigirSecretaria(actor, c);
        const inicial = await repository.recepcion(actor, movimientoId, c);
        if (!inicial) throw new HttpError(404, 'Entrega inexistente o no habilitada para Mesa de Partes');
        await documentos.bloquear(inicial.documento_id, c);
        await movimientos.bloquear(movimientoId, c);
        const entrega = await repository.recepcion(actor, movimientoId, c);
        if (!entrega) throw new HttpError(409, 'La entrega cambió; vuelva a consultarla');
        if (await repository.existe(entrega.documento_id, c)) throw new HttpError(409, 'El documento ya tiene un primer ingreso registrado');
        if (entrega.estado !== (recibir ? 'EN_TRASLADO' : 'RECIBIDO'))
            throw new HttpError(409, recibir ? 'La entrega ya no está pendiente de recepción' : 'Debe confirmar primero la recepción física');
        if (recibir) {
            await movimientos.recibir(movimientoId, actor.id, c);
            await documentos.recibir(entrega.documento_id, actor.id, actor.oficina_id!, datos.archivador_id ?? null, c);
        }
        if (await documentos.movimientoAbierto(entrega.documento_id, c)) throw new HttpError(409, 'Existe circulación o recuperación pendiente');
        const actual = await documentos.obtener(actor, entrega.documento_id, c);
        if (!actual || !['RECIBIDO', 'PENDIENTE_DECISION'].includes(actual.estado_tramite) || actual.destinatario_autorizado_id)
            throw new HttpError(409, 'El documento tiene una actuación incompatible; revise la decisión o circulación pendiente');
        await c.query("SELECT set_config('app.primer_ingreso_operacion',$1,true)", [recibir ? 'RECIBIR' : 'FORMALIZAR']);
        await repository.crear(actor, entrega.documento_id, movimientoId, datos, c);
        if (actual.estado_tramite !== 'PENDIENTE_DECISION') await documentos.solicitarDecision(entrega.documento_id, c);
        return entrega.documento_id as string;
    });
    return { documento_id: documento, ...await consultar(actorId, documento) };
}

/** Original externo: no inventa una entrega desde el exterior ni duplica un original existente. */
export async function externo(actorId: string, datos: Externo) {
    validarFecha(datos.presentacion);
    const documento = await transaccionDocumental(actorId, 'Registro de original externo y primer ingreso ordinario', async (c, actor) => {
        await exigirSecretaria(actor, c);
        if (await repository.existeSolicitud(actor, datos.solicitud_id, c))
            throw new HttpError(409, 'Esta solicitud de alta externa ya fue registrada; consulte el ingreso antes de repetirla');
        await pertenencia.validarAsignacion(actor, datos.archivo_id, c);
        if (!await documentos.tipoRegistrable(datos.tipo_documental_id, c)) throw new HttpError(400, 'Tipo no habilitado para el circuito ordinario');
        const id = await documentos.registrar(actor, datos, 'PENDIENTE_DECISION', c);
        await c.query("SELECT set_config('app.pertenencia_operacion','REGISTRAR',true),set_config('app.primer_ingreso_operacion','EXTERNO',true)");
        await pertenencia.vincular(actor, id, datos.archivo_id, 'Registro inicial de original externo en archivo de recepción', actor.oficina_id, c);
        await repository.crear(actor, id, null, datos.presentacion, c, datos.solicitud_id);
        return id;
    });
    return { documento_id: documento, ...await consultar(actorId, documento) };
}
