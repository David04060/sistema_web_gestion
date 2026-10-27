import pg from "pg";
import { env, perfilNeon } from "./env.js";
import { validarIdentidadPostgres, type IdentidadPostgres } from './neon.js';
const { Pool } = pg;
/** Pool compartido: las credenciales provienen del entorno y nunca se registran. */
export const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
});
pool.on("error", /** Registra un fallo inesperado del pool para diagnóstico; no modifica su ciclo de vida. */ (error) => {
    console.error("Error inesperado del pool PostgreSQL:", { tipo: error.name });
});
/** Consulta de solo lectura: impide arrancar contra una base distinta de la aprobada. */
export async function verificarBaseDatos() {
    const cliente = await pool.connect();
    try {
        const resultado = await cliente.query<IdentidadPostgres>(`SELECT current_database() AS base_datos, current_user AS usuario,
            current_setting('server_version') AS version, current_setting('neon.branch_id',true) AS rama`);
        // pg_stat_ssl describe el tramo interno tras el proxy; comprobar el socket de Node.
        const transporte = cliente as unknown as {
            connection?: { stream?: { encrypted?: boolean; authorized?: boolean } };
        };
        const socket = transporte.connection?.stream;
        const tls = socket?.encrypted === true && socket.authorized === true;
        validarIdentidadPostgres(resultado.rows[0], tls, perfilNeon,
            perfilNeon ? process.env.NEON_BRANCH_ID : undefined);
        if (perfilNeon && env.VINCULACION_ARCHIVOS_HABILITADA) {
            if (env.ACTUALIZACION_ARCHIVISTICA_PRODUCCION !== '20261026-archivo-v1')
                throw new Error('La activación de producción no identifica la versión aprobada');
            const estado=(await cliente.query<{activada:boolean; migraciones:number}>(`SELECT c.activada,
                (SELECT count(*)::int FROM migraciones_archivisticas m WHERE m.version_release=c.version) migraciones
                FROM capacidades_archivisticas c WHERE c.version=$1`,[env.ACTUALIZACION_ARCHIVISTICA_PRODUCCION])).rows[0];
            if (!estado?.activada || estado.migraciones!==10) throw new Error('La actualización archivística no está migrada y activada');
            const privilegios=(await cliente.query<{inseguro:boolean}>(`SELECT rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole
                OR has_schema_privilege('public','CREATE') OR has_table_privilege('documentos','DELETE')
                OR has_table_privilege('historial_modificaciones','UPDATE') OR has_table_privilege('movimientos_documentales','TRUNCATE') inseguro
                FROM pg_roles WHERE rolname=current_user`)).rows[0];
            if (!privilegios || privilegios.inseguro) throw new Error('El rol operativo conserva privilegios incompatibles con esta versión');
        }
        console.log("Conexión PostgreSQL verificada correctamente.");
        const identidad = resultado.rows[0]!;
        return { base_datos: identidad.base_datos, usuario: identidad.usuario, version: identidad.version, tls };
    } finally {
        cliente.release();
    }
}
/** Libera las conexiones durante apagado normal o fallo de arranque. */
export async function cerrarBaseDatos(): Promise<void> {
    await pool.end();
}
