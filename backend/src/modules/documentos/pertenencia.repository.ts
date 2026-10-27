import type { PoolClient } from 'pg';
import { pool } from '../../config/database.js';
import { env } from '../../config/env.js';
import { clienteDocumental } from '../../shared/documental/contexto.js';
import type { ActorDocumental } from '../../shared/documental/transaccion.js';
import { HttpError } from '../../shared/http/HttpError.js';

/** El circuito protegido conserva su implementación y no usa relaciones ordinarias. */
export const pertenenciaHabilitada = () => env.VINCULACION_ARCHIVOS_HABILITADA && !clienteDocumental();

/** Contexto RLS local para consultas ordinarias; nunca persiste en el pool. */
export async function consultar<T>(actor: ActorDocumental, operacion: (cliente?: PoolClient) => Promise<T>) {
    if (!pertenenciaHabilitada()) return operacion();
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await cliente.query("SELECT set_config('app.usuario_actor_id',$1,true)", [actor.id]);
        const resultado = await operacion(cliente);
        await cliente.query('COMMIT');
        return resultado;
    } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
    } finally { cliente.release(); }
}

export function exigirOperador(actor: ActorDocumental) {
    if (!pertenenciaHabilitada()) throw new HttpError(409, 'La vinculación ordinaria no está habilitada');
    if (!['Usuario', 'Director(a)', 'Secretaria de Dirección'].includes(actor.rol))
        throw new HttpError(403, 'Esta operación no está disponible para tu perfil administrativo');
}

/** Solo metadatos de archivos propios con asignación vigente, sin catálogos administrativos. */
export async function disponibles(actor: ActorDocumental, cliente: PoolClient) {
    return (await cliente.query(`SELECT a.id::text,a.nombre,a.responsabilidad,a.oficina_id::text,o.nombre oficina
        FROM archivos_institucionales a JOIN archivos_asignaciones s ON s.archivo_id=a.id
        JOIN oficinas o ON o.id=a.oficina_id JOIN usuarios u ON u.id=s.responsable_id
        WHERE s.responsable_id=$1 AND s.fecha_fin IS NULL AND s.fecha_inicio<=clock_timestamp()
          AND u.activo AND u.oficina_id=a.oficina_id ORDER BY a.nombre,a.id`, [actor.id])).rows;
}

/** Comparte el bloqueo institucional con asignaciones/cuentas y bloquea la cuenta; todas las escrituras de asignación usan ese mismo cerrojo. */
export async function validarAsignacion(actor: ActorDocumental, archivo: string, cliente: PoolClient) {
    const resultado = await cliente.query(`SELECT s.id FROM archivos_asignaciones s
        JOIN archivos_institucionales a ON a.id=s.archivo_id JOIN usuarios u ON u.id=s.responsable_id
        WHERE a.id=$1 AND s.responsable_id=$2 AND s.fecha_fin IS NULL AND s.fecha_inicio<=clock_timestamp()
          AND u.activo AND u.oficina_id=a.oficina_id FOR SHARE OF u`, [archivo, actor.id]);
    if (!resultado.rowCount) throw new HttpError(403, 'Seleccione un archivo con asignación vigente a su nombre y compatible con su oficina');
}

/** Inserción inmutable: no actualiza documento, código, custodia ni ubicación. */
export async function vincular(actor: ActorDocumental, documento: string, archivo: string, fundamento: string,
    oficinaInicial: string | null, cliente: PoolClient) {
    try {
        await cliente.query(`INSERT INTO documentos_archivos(documento_id,archivo_id,vinculado_por_id,
            fecha_vinculacion,fundamento,oficina_registro_id) VALUES($1,$2,$3,clock_timestamp(),$4,$5)`,
        [documento, archivo, actor.id, fundamento, oficinaInicial]);
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === '23505')
            throw new HttpError(409, 'El documento ya está vinculado a un archivo institucional');
        throw error;
    }
}

/** En registros antiguos solo se acepta evidencia de CREAR; nunca la oficina actual de la cuenta. */
export async function oficinaHistorica(documento: string, cliente: PoolClient): Promise<string | null> {
    return (await cliente.query<{ id: string }>(`SELECT o.id::text FROM historial_modificaciones h
        JOIN oficinas o ON o.id::text=coalesce(h.campos_modificados->'creacion'->>'oficina_responsable_id',
            h.campos_modificados->'oficina_responsable_id'->>'despues', h.campos_modificados->>'oficina_responsable_id')
        WHERE h.tabla='documentos' AND h.registro_id=$1 AND h.accion='CREAR' ORDER BY h.fecha,h.id LIMIT 1`, [documento])).rows[0]?.id ?? null;
}
