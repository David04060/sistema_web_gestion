import type { PoolClient } from "pg";
import { pool } from "../../config/database.js";
import { HttpError } from "../http/HttpError.js";
/**
 * Unidad de escritura administrativa. Serializa cambios de asignación/último admin,
 * revalida al actor después de adquirir el bloqueo y configura la auditoría existente.
 * El bloqueo es transaccional y no crea estructuras ni persiste estado auxiliar.
 */
export async function escrituraAdministrativa<T>(actorId: string, operacion: (cliente: PoolClient) => Promise<T>): Promise<T> {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        await cliente.query("SELECT pg_advisory_xact_lock(hashtext('administracion-institucional'))");
        const actor = await cliente.query<{
            activo: boolean;
            rol: string;
        }>(`SELECT u.activo, r.nombre AS rol FROM usuarios u JOIN roles r ON r.id=u.rol_id
       WHERE u.id=$1::bigint FOR SHARE OF u, r`, [actorId]);
        if (!actor.rows[0]?.activo)
            throw new HttpError(401, "La cuenta ya no está activa");
        if (actor.rows[0].rol !== "Administrador")
            throw new HttpError(403, "Solo el Administrador puede realizar esta operación");
        await cliente.query("SELECT set_config('app.usuario_actor_id', $1, true)", [actorId]);
        const resultado = await operacion(cliente);
        await cliente.query("COMMIT");
        return resultado;
    }
    catch (error) {
        await cliente.query("ROLLBACK");
        throw error;
    }
    finally {
        cliente.release();
    }
}
