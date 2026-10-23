import pg from "pg";
import { env, perfilNeon, perfilQa } from "./env.js";
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
        const resultado = await cliente.query<{
            base_datos: string;
            usuario: string;
            version: string;
            rama: string | null;
        }>(`SELECT current_database() AS base_datos, current_user AS usuario,
            current_setting('server_version') AS version, current_setting('neon.branch_id',true) AS rama`);
        // pg_stat_ssl describe el tramo interno tras el proxy; comprobar el socket de Node.
        const transporte = cliente as unknown as {
            connection?: { stream?: { encrypted?: boolean; authorized?: boolean } };
        };
        const socket = transporte.connection?.stream;
        const tls = socket?.encrypted === true && socket.authorized === true;
        const nombre = resultado.rows[0]?.base_datos;
        if (nombre !== (perfilNeon ? "neondb" : "sistema_web_final")
            || (perfilNeon && (resultado.rows[0]?.usuario !== "sistema_web_app" || !tls))
            || (perfilQa && resultado.rows[0]?.rama !== process.env.NEON_BRANCH_ID)) {
            throw new Error("El backend está conectado a una base de datos inesperada.");
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
