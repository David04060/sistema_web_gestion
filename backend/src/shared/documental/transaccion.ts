import { clienteDocumental, conexionDocumental } from './contexto.js';
import type { PoolClient } from 'pg';
import { pool } from '../../config/database.js';
import { HttpError } from '../http/HttpError.js';
export interface ActorDocumental {
    id: string;
    rol: string;
    oficina_id: string | null;
    activo: boolean;
}
/** Permisos vigentes de PostgreSQL, nunca inferidos de datos enviados por React. */
export async function obtenerActor(id: string, cliente?: PoolClient): Promise<ActorDocumental> {
    const actor = (await (cliente ?? conexionDocumental()).query<ActorDocumental>(
            `SELECT u.id::text,u.oficina_id::text,u.activo,r.nombre rol FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.id=$1::bigint`,
        [id])
    ).rows[0];
    if (!actor?.activo)
        throw new HttpError(401, 'La cuenta ya no está activa');
    return actor;
}
/**
 * Unidad de trabajo documental: revalida la cuenta y configura los triggers existentes.
 * El llamador bloquea la fila del documento antes de comprobar permisos y transiciones.
 * @param actorId Usuario autenticado que figurará en auditoría.
 * @param motivo Motivo de corrección o evento confirmado, local a esta transacción.
 * @param operacion Operación atómica; un rechazo revierte también auditoría y correlativos.
 */
export async function transaccionDocumental<T>(actorId: string, motivo: string, operacion: (cliente: PoolClient, actor: ActorDocumental) => Promise<T>): Promise<T> {
    const existente = clienteDocumental();
    if (existente) {
        await existente.query("SELECT set_config('app.motivo_documental',$1,true)", [motivo]);
        return operacion(existente, await obtenerActor(actorId, existente));
    }
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        // Comparte orden de bloqueo con cambios de cuenta/oficina y reasignaciones de ubicaciones.
        await cliente.query("SELECT pg_advisory_xact_lock(hashtext('administracion-institucional'))");
        const actor = await obtenerActor(actorId, cliente);
        await cliente.query("SELECT set_config('app.usuario_actor_id',$1,true),set_config('app.motivo_documental',$2,true)", [actorId, motivo]);
        const resultado = await operacion(cliente, actor);
        await cliente.query('COMMIT');
        return resultado;
    }
    catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
    }
    finally {
        cliente.release();
    }
}
