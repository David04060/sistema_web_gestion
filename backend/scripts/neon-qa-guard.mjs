import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import pg from 'pg';
import { URL } from 'node:url';

/** Solo lee los archivos privados. La identidad QA se contrasta con PostgreSQL antes de escribir. */
export function cargarQa() {
    const qa = parse(readFileSync('.env.neon.qa'));
    const principal = parse(readFileSync('.env.neon'));
    const url = new URL(qa.DATABASE_URL);
    const prod = new URL(principal.DATABASE_URL);
    assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'Protocolo QA inválido');
    assert.equal(url.hostname.endsWith('.neon.tech'), true, 'Host QA no es Neon');
    assert.equal(url.hostname.includes('-pooler'), false, 'QA debe usar host directo');
    assert.notEqual(url.hostname, prod.hostname, 'QA coincide con el host principal');
    assert.equal(decodeURIComponent(url.username), 'sistema_web_app', 'QA requiere el usuario de aplicación');
    assert.equal(url.pathname, '/neondb', 'Base QA inesperada');
    assert.equal(url.searchParams.get('sslmode'), 'verify-full', 'QA requiere TLS verificado');
    assert.match(qa.NEON_BRANCH_ID ?? '', /^br-[a-z0-9-]+$/, 'Falta NEON_BRANCH_ID de qa-pruebas');
    assert.ok(qa.JWT_SECRET?.length >= 32, 'Secreto JWT QA incompleto');
    if (qa.NEON_QA_HOST) assert.equal(url.hostname, qa.NEON_QA_HOST, 'Host QA no coincide con el declarado');
    return qa;
}

/** No crea bases, tablas o fixtures. Devuelve un pool solo después de comprobar la rama. */
export async function abrirQa() {
    const qa = cargarQa();
    const pool = new pg.Pool({ connectionString: qa.DATABASE_URL, max: 12, connectionTimeoutMillis: 15000 });
    try {
        const identidad = (await pool.query(`SELECT current_database() base_datos,current_user usuario,
            current_setting('server_version') version,current_setting('neon.branch_id',true) rama`)).rows[0];
        assert.equal(identidad.base_datos, 'neondb', 'Base QA inesperada');
        assert.equal(identidad.usuario, 'sistema_web_app', 'Usuario QA inesperado');
        assert.equal(identidad.rama, qa.NEON_BRANCH_ID, 'La rama PostgreSQL no coincide con qa-pruebas');
        return { qa, pool, identidad };
    } catch (error) {
        await pool.end();
        throw error;
    }
}
