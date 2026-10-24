import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import pg from 'pg';
import { URL } from 'node:url';
import { validarUrlNeon, validarIdentidadPostgres } from '../dist/config/neon.js';

/** Solo herramientas operativas. Nunca carga el perfil local ni imprime una URL privada. */
export function cargarProduccion() {
    const datos = process.env.PRODUCTION_CONFIG_SOURCE === 'environment' ? process.env
        : parse(readFileSync(process.env.PRODUCTION_CONFIG_FILE ?? '.env.neon.production'));
    assert.ok(validarUrlNeon(datos.DATABASE_URL ?? '', datos.NEON_HOST), 'Conexión directa production inválida');
    assert.ok(datos.NEON_HOST, 'Falta NEON_HOST autorizado');
    assert.match(datos.NEON_BRANCH_ID ?? '', /^br-[a-z0-9-]+$/, 'Falta Branch ID autorizado');
    assert.ok(datos.NEON_PROJECT_ID, 'Falta Project ID');
    return { ...datos, NEON_HOST: datos.NEON_HOST ?? new URL(datos.DATABASE_URL).hostname };
}

/** Sesión con READ ONLY por defecto, validada antes de consultar metadatos o datos. */
export async function abrirProduccionLectura({ respaldoCompleto = false } = {}) {
    let configuracion = cargarProduccion();
    let usuarioEsperado = 'sistema_web_app';
    if (respaldoCompleto) {
        const backup = process.env.BACKUP_DATABASE_URL ? process.env
            : parse(readFileSync('../.private/production/backup.env'));
        usuarioEsperado = new URL(backup.BACKUP_DATABASE_URL).username;
        assert.ok(['sistema_web_app', 'neondb_owner'].includes(usuarioEsperado), 'Rol de respaldo inesperado');
        assert.ok(validarUrlNeon(backup.BACKUP_DATABASE_URL, configuracion.NEON_HOST, usuarioEsperado), 'Respaldo debe usar el mismo endpoint production y TLS');
        configuracion = { ...configuracion, DATABASE_URL: backup.BACKUP_DATABASE_URL };
    }
    const cliente = new pg.Client({ connectionString: configuracion.DATABASE_URL, connectionTimeoutMillis: 15000,
        options: '-c default_transaction_read_only=on', application_name: 'documental-production-readonly' });
    try {
        await cliente.connect();
        await cliente.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await cliente.query("SET LOCAL statement_timeout='30s'");
        const identidad = (await cliente.query(`SELECT current_database() base_datos,current_user usuario,
            current_setting('server_version') version,current_setting('neon.branch_id',true) rama`)).rows[0];
        const stream = cliente.connection.stream;
        validarIdentidadPostgres(identidad, stream.encrypted === true && stream.authorized === true, true, configuracion.NEON_BRANCH_ID, usuarioEsperado);
        return { cliente, configuracion, identidad, cerrar: async () => { await cliente.query('ROLLBACK'); await cliente.end(); } };
    } catch (error) { await cliente.end().catch(() => {}); throw error; }
}
