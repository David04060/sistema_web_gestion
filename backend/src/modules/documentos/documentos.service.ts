import type { PoolClient } from 'pg';
import type { ActorDocumental } from '../../shared/documental/transaccion.js';
import { transaccionDocumental, obtenerActor } from '../../shared/documental/transaccion.js';
import { HttpError } from '../../shared/http/HttpError.js';
import * as repository from './documentos.repository.js';
import type { Contenido, Registrar, Filtros } from './documentos.schema.js';
/**
 * Revalida al actor y obtiene página y total autorizados; conserva los filtros de paginación en la respuesta.
 * @param actorId - ID de la cuenta autenticada que debe revalidarse antes de operar.
 * @param filtros - Filtros validados de búsqueda y paginación.
 */
export async function listar(actorId: string, filtros: Filtros) {
    const actor = await obtenerActor(actorId);
    return { ...await repository.listar(actor, filtros), pagina: filtros.pagina, limite: filtros.limite };
}
/**
 * Obtiene el contenido consultable y calcula permisos de presentación con custodia y estado vigentes.
 * La autorización de contenido precede a consultar ubicación anterior o auditoría.
 * @param actorId - Cuenta autenticada; se consulta su actividad y rol en PostgreSQL.
 * @param id - Documento cuyo contenido se solicita.
 * @returns Documento, antecedente de ubicación y operaciones potencialmente disponibles.
 * @throws HttpError 401 si la cuenta está inactiva o 404 si el documento no existe o no es consultable.
 * Las escrituras vuelven a validar las reglas dentro de su transacción; estos indicadores no autorizan por sí mismos.
 */
export async function detalle(actorId: string, id: string) {
    const actor = await obtenerActor(actorId);
    const documento = await repository.obtener(actor, id);
    if (!documento)
        throw new HttpError(404, 'Documento inexistente o no autorizado');
    const libre = documento.activo && ['RECIBIDO', 'PENDIENTE_DECISION'].includes(documento.estado_tramite);
    const custodio = libre && documento.responsable_actual_id === actor.id;
    const mesa = actor.rol === 'Secretaria de Dirección' || documento.oficina === 'Mesa de Partes';
    return { ...documento, ultima_ubicacion: await repository.ultimaUbicacion(id), permisos: { editar: custodio, anular: custodio, autorizar: libre && documento.estado_tramite === 'PENDIENTE_DECISION' && actor.rol === 'Director(a)', salir: custodio && (documento.estado_tramite === 'PENDIENTE_DECISION' ? documento.destinatario_autorizado_id !== null : !mesa), solicitar_decision: custodio && mesa && documento.estado_tramite === 'RECIBIDO' } };
}
/**
 * Autoriza primero el contenido del documento y solo después solicita su auditoría completa.
 * @param actorId - ID de la cuenta autenticada que debe revalidarse antes de operar.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 */
export async function historial(actorId: string, id: string) {
    await detalle(actorId, id);
    return repository.historial(id);
}
/** Bloquea antes de evaluar permisos, evitando decisiones basadas en una custodia antigua. */
export async function documentoBloqueado(actor: ActorDocumental, id: string, cliente: PoolClient) {
    await repository.bloquear(id, cliente);
    const documento = await repository.obtener(actor, id, cliente);
    if (!documento)
        throw new HttpError(404, 'Documento inexistente o no autorizado');
    if (!documento.activo)
        throw new HttpError(409, 'El documento esta anulado');
    return documento;
}
/**
 * Exige custodia actual y ausencia de traslado o recuperación abierta; rechaza con 403 o 409 antes de modificar el documento.
 * @param actor - Cuenta o ID autenticado utilizado para aplicar autorización y auditoría.
 * @param documento - Fila bloqueada y autorizada cuya custodia se comprueba.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 */
export async function exigirEditable(actor: ActorDocumental, documento: repository.Documento, cliente: PoolClient) {
    if (documento.responsable_actual_id !== actor.id)
        throw new HttpError(403, 'Solo el custodio actual puede realizar esta operacion');
    if (await repository.movimientoAbierto(documento.id, cliente))
        throw new HttpError(409, 'Primero debe finalizar la circulacion o recuperacion fisica');
}
/**
 * Revalida al actor y obtiene catálogos y filtros documentales limitados por su acceso actual.
 * @param actorId - ID de la cuenta autenticada que debe revalidarse antes de operar.
 */
export async function opciones(actorId: string) {
    return repository.opciones(await obtenerActor(actorId));
}
/**
 * Registra el original bajo custodia del actor y su oficina vigente.
 * @param datos Contenido humano y referencias; el trigger genera codigo y fechas.
 * @returns Detalle autorizado despues de confirmar la transaccion.
 */
export async function registrar(actorId: string, datos: Registrar) {
    const id = await transaccionDocumental(actorId, 'Registro inicial del documento fisico', /** Verifica oficina y tipo registrable antes de insertar el original con estado inicial del circuito correspondiente. */ async (cliente, actor) => {
        if (!actor.oficina_id)
            throw new HttpError(409, 'Debe tener una oficina asignada para registrar documentos');
        if (!await repository.tipoRegistrable(datos.tipo_documental_id, cliente))
            throw new HttpError(400, 'Tipo restringido o sin prefijo documental aprobado');
        const mesa = actor.rol === 'Secretaria de Dirección' || await repository.oficinaNombre(actor.oficina_id, cliente) === 'Mesa de Partes';
        return repository.registrar(actor, datos, mesa ? 'PENDIENTE_DECISION' : 'RECIBIDO', cliente);
    });
    return detalle(actorId, id);
}
/** Corrige exclusivamente contenido; motivo e identidad quedan en auditoria atomica. */
export async function corregir(actorId: string, id: string, datos: Contenido & {
    motivo: string;
}) {
    await transaccionDocumental(actorId, datos.motivo, /** Bloquea y comprueba custodia antes de corregir exclusivamente el contenido con auditoría atómica. */ async (cliente, actor) => {
        const documento = await documentoBloqueado(actor, id, cliente);
        await exigirEditable(actor, documento, cliente);
        await repository.corregir(id, datos, cliente);
    });
    return detalle(actorId, id);
}
/** Anulacion logica irreversible desde la interfaz; conserva codigo, relaciones e historial. */
export async function anular(actorId: string, id: string, motivo: string) {
    await transaccionDocumental(actorId, motivo, /** Bloquea y comprueba custodia antes de anular lógicamente conservando el historial. */ async (cliente, actor) => {
        const documento = await documentoBloqueado(actor, id, cliente);
        await exigirEditable(actor, documento, cliente);
        await repository.anular(id, cliente);
    });
    return detalle(actorId, id);
}
/**
 * Dirección registra o retira su decisión sin cambiar PENDIENTE_DECISION ni crear un movimiento.
 * @param actorId - Cuenta autenticada que debe ser Director(a) de la oficina Dirección.
 * @param id - Documento activo y pendiente sobre el que se registra la decisión.
 * @param destinatario - Cuenta activa con oficina; null retira una autorización existente.
 * @param motivo - Justificación conservada en la auditoría de la misma transacción.
 * @returns Detalle autorizado después del commit; Mesa de Partes confirma la salida en otra operación.
 * @throws HttpError 403 por actor incompatible, 409 por estado o retiro inválidos y 400 por destino incompatible.
 */
export async function autorizar(actorId: string, id: string, destinatario: string | null, motivo: string) {
    await transaccionDocumental(actorId, motivo, /** Bloquea el documento y exige Dirección, estado pendiente y destino válido antes de escribir o retirar la tríada de autorización. */ async (cliente, actor) => {
        const documento = await documentoBloqueado(actor, id, cliente);
        if (actor.rol !== 'Director(a)' || !actor.oficina_id || await repository.oficinaNombre(actor.oficina_id, cliente) !== 'Dirección')
            throw new HttpError(403, 'Solo Direccion autoriza o retira la derivacion');
        if (documento.estado_tramite !== 'PENDIENTE_DECISION')
            throw new HttpError(409, 'El documento no espera decision');
        if (!destinatario && !documento.destinatario_autorizado_id)
            throw new HttpError(409, 'No existe autorizacion para retirar');
        const destino = destinatario ? await repository.destino(destinatario, cliente) : null;
        if (destinatario && (!destino || destinatario === documento.responsable_actual_id))
            throw new HttpError(400, 'Destinatario no valido');
        await repository.autorizar(id, destino?.id ?? null, destino?.oficina_id ?? null, destino ? actor.id : null, cliente);
    });
    return detalle(actorId, id);
}
/** Reinicia el circuito de Direccion cuando Mesa de Partes vuelve a tener el original. */
export async function solicitarDecision(actorId: string, id: string, motivo: string) {
    await transaccionDocumental(actorId, motivo, /** Exige custodia y circuito de Mesa de Partes antes de volver a solicitar decisión de Dirección. */ async (cliente, actor) => {
        const documento = await documentoBloqueado(actor, id, cliente);
        await exigirEditable(actor, documento, cliente);
        if (documento.estado_tramite !== 'RECIBIDO' || (actor.rol !== 'Secretaria de Dirección' && await repository.oficinaNombre(documento.oficina_responsable_id, cliente) !== 'Mesa de Partes'))
            throw new HttpError(409, 'Esta operacion corresponde a documentos recibidos en Mesa de Partes');
        await repository.solicitarDecision(id, cliente);
    });
    return detalle(actorId, id);
}
