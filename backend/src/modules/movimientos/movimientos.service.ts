import * as ingresos from '../ingresos/ingresos.repository.js';
import * as documentos from '../documentos/documentos.repository.js';
import { documentoBloqueado, exigirEditable } from '../documentos/documentos.service.js';
import { transaccionDocumental, obtenerActor } from '../../shared/documental/transaccion.js';
import { HttpError } from '../../shared/http/HttpError.js';
import * as repository from './movimientos.repository.js';
import type { Filtros } from './movimientos.schema.js';
/** El repositorio limita tanto filas como conteos a documentos ordinarios autorizados. */
export async function listar(actorId: string, filtros: Filtros) {
    const actor = await obtenerActor(actorId);
    return { ...await ingresos.lectura(actor, c => repository.listar(actor, filtros, c)), pagina: filtros.pagina, limite: filtros.limite };
}
/**
 * Revalida al actor y devuelve el movimiento consultable; utiliza el mismo 404 para inexistencia o falta de autorización.
 * @param actorId - ID de la cuenta autenticada que debe revalidarse antes de operar.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 */
export async function detalle(actorId: string, id: string) {
    const actor = await obtenerActor(actorId);
    return ingresos.lectura(actor, async c => {
        const movimiento = await repository.obtener(actor, id, c);
        if (!movimiento) throw new HttpError(404, 'Movimiento inexistente o no autorizado');
        if (!ingresos.habilitado()) return movimiento;
        // Datos y disponibilidad pertenecen a la misma instantánea autorizada.
        const puedeIngresar = actor.rol === 'Secretaria de Dirección'
            && movimiento.usuario_destino_id === actor.id && !movimiento.ingreso_referencia
            && actor.oficina_id !== null && await documentos.oficinaNombre(actor.oficina_id, c!) === 'Mesa de Partes';
        const admite = puedeIngresar && !!await ingresos.recepcion(actor, id, c!)
            && !await ingresos.existe(movimiento.documento_id, c!);
        return { ...movimiento, puede_primer_ingreso: !!admite };
    });
}
/** Salida real: movimiento y consumo de autorizacion se confirman en una unica transaccion. */
export async function derivar(actorId: string, datos: {
    documento_id: string;
    usuario_destino_id: string;
    motivo: string;
}) {
    const id = await transaccionDocumental(actorId, datos.motivo, /** Bloquea el documento, valida custodio y destino y registra movimiento y salida como una sola operación. */ async (cliente, actor) => {
        const documento = await documentoBloqueado(actor, datos.documento_id, cliente);
        await exigirEditable(actor, documento, cliente);
        if (!['RECIBIDO', 'PENDIENTE_DECISION'].includes(documento.estado_tramite))
            throw new HttpError(409, 'El documento no permite salida');
        if (documento.estado_tramite === 'PENDIENTE_DECISION' && documento.destinatario_autorizado_id !== datos.usuario_destino_id)
            throw new HttpError(409, 'La salida requiere el destinatario autorizado por Direccion');
        if (documento.estado_tramite === 'RECIBIDO' && (actor.rol === 'Secretaria de Dirección' || await documentos.oficinaNombre(documento.oficina_responsable_id, cliente) === 'Mesa de Partes'))
            throw new HttpError(409, 'Primero solicite la decision de Direccion');
        const destino = await documentos.destino(datos.usuario_destino_id, cliente);
        if (!destino || destino.id === actor.id)
            throw new HttpError(400, 'Destinatario no valido');
        if (documento.oficina_destino_autorizada_id && destino.oficina_id !== documento.oficina_destino_autorizada_id)
            throw new HttpError(409, 'La oficina del destinatario cambio; Direccion debe revisar su autorizacion');
        const movimiento = await repository.crear(documento, destino, cliente);
        await documentos.salida(documento.id, cliente);
        return movimiento;
    });
    return detalle(actorId, id);
}
type Evento = 'recibir' | 'rechazar' | 'recuperar' | 'cancelar';
/**
 * Cierra la operacion fisica bajo bloqueo del documento y luego del movimiento.
 * El destinatario confirma entrega/rechazo; solo origen confirma recuperacion.
 * PostgreSQL valida nuevamente actores, fechas y coherencia final al COMMIT.
 * @param actorId - Cuenta autenticada que confirma el hecho físico.
 * @param id - Movimiento consultable que se reconsulta después de adquirir los bloqueos.
 * @param evento - Recepción, rechazo, recuperación o cancelación admitida por el contrato.
 * @param datos - Archivador de recepción/recuperación y motivo requerido por la operación, previamente validados por Zod.
 * @returns Movimiento actualizado después de confirmar también estado, custodia y ubicación del documento.
 * @throws HttpError 404 por registro no consultable, 403 por actor incorrecto o 409 por estado u oficina incompatibles.
 */
export async function resolver(actorId: string, id: string, evento: Evento, datos: {
    archivador_id?: string | null;
    motivo?: string;
}) {
    await transaccionDocumental(actorId, datos.motivo ?? 'Recepcion fisica confirmada por el destinatario', /** Bloquea documento antes de movimiento, reconsulta el estado y confirma el hecho físico solo para el actor correspondiente. */ async (cliente, actor) => {
        let movimiento = await repository.obtener(actor, id, cliente);
        if (!movimiento)
            throw new HttpError(404, 'Movimiento inexistente o no autorizado');
        await documentos.bloquear(movimiento.documento_id, cliente);
        await repository.bloquear(id, cliente);
        movimiento = await repository.obtener(actor, id, cliente);
        if (!movimiento)
            throw new HttpError(404, 'Movimiento inexistente o no autorizado');
        const destinatario = evento === 'recibir' || evento === 'rechazar';
        if ((destinatario ? movimiento.usuario_destino_id : movimiento.usuario_origen_id) !== actor.id)
            throw new HttpError(403, 'No tiene permiso para confirmar esta operacion');
        if (evento === 'recuperar' ? (movimiento.estado !== 'RECHAZADO' || movimiento.devolucion_confirmada_por_id !== null) : movimiento.estado !== 'EN_TRASLADO')
            throw new HttpError(409, 'El movimiento ya no admite esta operacion');
        if (evento === 'recibir') {
            if (actor.oficina_id !== movimiento.oficina_destino_id)
                throw new HttpError(409, 'Su oficina ya no coincide con el destino autorizado');
            await repository.recibir(id, actor.id, cliente);
            await documentos.recibir(movimiento.documento_id, actor.id, movimiento.oficina_destino_id, datos.archivador_id ?? null, cliente);
        }
        else if (evento === 'rechazar') {
            await repository.rechazar(id, actor.id, datos.motivo!, cliente);
            await documentos.rechazar(movimiento.documento_id, cliente);
        }
        else {
            if (evento === 'recuperar')
                await repository.recuperar(id, actor.id, cliente);
            else
                await repository.cancelar(id, actor.id, datos.motivo!, cliente);
            await documentos.recibir(movimiento.documento_id, movimiento.usuario_origen_id, movimiento.oficina_origen_id, datos.archivador_id ?? null, cliente);
        }
    });
    return detalle(actorId, id);
}
