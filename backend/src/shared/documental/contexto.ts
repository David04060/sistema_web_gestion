import type { Pool, PoolClient } from 'pg';
import { pool } from '../../config/database.js';

/** Compatibilidad con servicios históricos no montados: ya no existe una conexión con privilegios por tipo. */
export function clienteDocumental(): PoolClient | undefined {
    return undefined;
}
/** Las consultas históricas conservan el pool ordinario, sin acceso restringido por solicitud. */
export function conexionDocumental(): Pool | PoolClient {
    return pool;
}
/** Conserva la exclusión general de tipos protegidos del modelo histórico. No interviene en el modelo vigente. */
export function tipoVisibleSQL() {
    return 'NOT td.requiere_clave';
}
