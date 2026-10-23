import type { PoolClient } from 'pg';
import { pool } from '../../config/database.js';
import { HttpError } from '../../shared/http/HttpError.js';
import * as repository from './ubicaciones.repository.js';
import type { EstanteDatos, ArchivadorDatos, Filtros } from './ubicaciones.schema.js';
/** Recupera permisos vigentes desde PostgreSQL; una cuenta inactiva nunca opera. */
async function actor(id: string, cliente?: PoolClient) {
    const actorActual = await repository.actor(id, cliente);
    if (!actorActual?.activo)
        throw new HttpError(401, 'La cuenta ya no está activa');
    return actorActual;
}
/** Serializa con la administración de usuarios, revalida permisos y configura la auditoría local. */
async function escribir<T>(id: string, fn: (actorActual: repository.Actor, cliente: PoolClient) => Promise<T>) {
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        await cliente.query("SELECT pg_advisory_xact_lock(hashtext('administracion-institucional'))");
        const actorActual = await actor(id, cliente);
        await cliente.query("SELECT set_config('app.usuario_actor_id',$1,true)", [id]);
        const result = await fn(actorActual, cliente);
        await cliente.query('COMMIT');
        return result;
    }
    catch (registro) {
        await cliente.query('ROLLBACK');
        throw registro;
    }
    finally {
        cliente.release();
    }
}
/**
 * Permite modificar la ubicación al administrador o a su responsable; rechaza con 403 cualquier modificación ajena.
 * @param registro - Fila consultada que debe proyectarse sin modificar la persistencia.
 */
function editable(actorActual: repository.Actor, registro: repository.Estante) {
    if (actorActual.rol !== 'Administrador' && registro.usuario_id !== actorActual.id)
        throw new HttpError(403, 'No puedes modificar ubicaciones ajenas');
}
/**
 * Revalida la cuenta y devuelve estantes dentro de su alcance de consulta y filtros.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param filtros - Filtros validados de búsqueda y paginación.
 */
export async function listarEstantes(id: string, filtros: Filtros) {
    return repository.estantes(await actor(id), filtros);
}
/**
 * Revalida la cuenta y devuelve archivadores dentro de su alcance de consulta y filtros.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param filtros - Filtros validados de búsqueda y paginación.
 */
export async function listarArchivadores(id: string, filtros: Filtros) {
    return repository.archivadores(await actor(id), filtros);
}
/**
 * Consulta el estante autorizado y sus archivadores; responde 404 sin distinguir registros ajenos de inexistentes.
 * @param idActor - ID de la cuenta autenticada responsable de la operación.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 */
export async function detalleEstante(idActor: string, id: string) {
    const actorActual = await actor(idActor);
    const registro = (await repository.estantes(actorActual, {}, id))[0];
    if (!registro)
        throw new HttpError(404, 'Estante inexistente o no autorizado');
    return { estante: registro, archivadores: await repository.archivadores(actorActual, { estante_id: id }) };
}
/**
 * Consulta un archivador autorizado o responde 404 sin revelar la existencia de registros ajenos.
 * @param idActor - ID de la cuenta autenticada responsable de la operación.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 */
export async function detalleArchivador(idActor: string, id: string) {
    const registro = (await repository.archivadores(await actor(idActor), {}, id))[0];
    if (!registro)
        throw new HttpError(404, 'Archivador inexistente o no autorizado');
    return registro;
}
/** Opciones de asignación: las cuentas ajenas solo se enumeran para el Administrador. */
export async function opciones(id: string) {
    const actorActual = await actor(id);
    return { actor_id: actorActual.id, administrador: actorActual.rol === 'Administrador', oficinas: (await repository.oficinas()).filter(/** Restringe las opciones de oficina al alcance que permite el rol actual. */  o => actorActual.rol === 'Administrador' || o.id === actorActual.oficina_id), responsables: actorActual.rol === 'Administrador' ? await repository.responsables() : [], oficina_id: actorActual.oficina_id };
}
/**
 * Crea o edita un estante conservando su oficina institucional.
 * @param idActor Cuenta autenticada que quedará registrada en auditoría.
 * @param datos Código y asignaciones validados por Zod.
 * @param id Identificador existente; null indica creación.
 * @returns Estante autorizado actualizado con IDs transportados como texto.
 */
export async function guardarEstante(idActor: string, datos: EstanteDatos, id: string | null = null) {
    return escribir(idActor, /** Bloquea el estante y valida responsabilidad, oficina fija y código único antes de guardar. */ async (actorActual, cliente) => {
        if (id)
            await repository.bloquearEstante(id, cliente);
        const anterior = id ? (await repository.estantes(actorActual, {}, id, cliente))[0] : undefined;
        if (id && !anterior)
            throw new HttpError(404, 'Estante inexistente o no autorizado');
        if (anterior) {
            editable(actorActual, anterior);
            if (datos.oficina_id !== anterior.oficina_id)
                throw new HttpError(409, 'La oficina institucional del estante no se traslada mediante edición');
        }
        if (actorActual.rol !== 'Administrador' && (datos.usuario_id !== actorActual.id || (!anterior && datos.oficina_id !== actorActual.oficina_id)))
            throw new HttpError(403, 'Solo puedes crear ubicaciones propias en tu oficina');
        // Se permite conservar un responsable histórico inactivo o trasladado; nunca asignarlo de nuevo.
        if (!anterior || datos.usuario_id !== anterior.usuario_id) {
            const responsable = await repository.actor(datos.usuario_id, cliente);
            if (!responsable?.activo || responsable.oficina_id !== datos.oficina_id)
                throw new HttpError(400, 'El responsable debe estar activo y pertenecer a la oficina del estante');
        }
        if (!(await repository.oficinas(cliente)).some(/** Comprueba la existencia de la oficina institucional seleccionada. */  o => o.id === datos.oficina_id))
            throw new HttpError(400, 'Oficina inexistente');
        if (await repository.duplicadoEstante(datos, id, cliente))
            throw new HttpError(409, 'El responsable ya tiene un estante con ese código');
        return (await repository.estantes(actorActual, {}, await repository.guardarEstante(datos, id, cliente), cliente))[0]!;
    });
}
/**
 * Crea un archivador en un estante editable o cambia su número sin trasladarlo.
 * La numeración es única dentro del padre; las referencias documentales conservan el ID.
 */
export async function guardarArchivador(idActor: string, datos: ArchivadorDatos, id: string | null = null) {
    return escribir(idActor, /** Bloquea el estante padre y valida edición y número único sin permitir trasladar el archivador. */ async (actorActual, cliente) => {
        await repository.bloquearEstante(datos.estante_id, cliente);
        const registro = (await repository.estantes(actorActual, {}, datos.estante_id, cliente))[0];
        if (!registro)
            throw new HttpError(404, 'Estante inexistente o no autorizado');
        editable(actorActual, registro);
        if (id) {
            const anterior = (await repository.archivadores(actorActual, {}, id, cliente))[0];
            if (!anterior)
                throw new HttpError(404, 'Archivador inexistente o no autorizado');
            if (anterior.estante_id !== datos.estante_id)
                throw new HttpError(409, 'No se permite trasladar el archivador mediante edición');
        }
        if (await repository.duplicadoArchivador(datos, id, cliente))
            throw new HttpError(409, 'El número ya existe dentro del estante');
        return (await repository.archivadores(actorActual, {}, await repository.guardarArchivador(datos, id, cliente), cliente))[0]!;
    });
}
