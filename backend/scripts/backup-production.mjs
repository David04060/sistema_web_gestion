import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getCACertificates } from 'node:tls';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { abrirProduccionLectura } from './production-config.mjs';
import { crearArchivoCifrado, claveLocal } from './backup/encrypted-archive.mjs';

/** Respaldo completo y verificado de la rama autorizada; no modifica PostgreSQL. */
async function respaldar() {
    if (process.env.PRODUCTION_CONFIG_SOURCE === 'environment' && !process.env.BACKUP_KEY_BASE64) {
        throw new Error('La automatización requiere una clave de cifrado persistente configurada como secreto');
    }
    const sesion = await abrirProduccionLectura({ respaldoCompleto: true });
    const cfg = sesion.configuracion;
    await sesion.cerrar();
    const url = new URL(cfg.DATABASE_URL);
    // libpq/OpenSSL en Windows no comparte automáticamente el almacén de Node.
    // Exportar las mismas CA públicas confiables conserva verify-full y hostname.
    const caPath = resolve('../.private/production/tls-ca-bundle.pem');
    await mkdir(dirname(caPath), { recursive: true });
    await writeFile(caPath, getCACertificates('default').join('\n'));
    const entorno = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: 'neondb',
        PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: 'verify-full',
        PGOPTIONS: '-c default_transaction_read_only=on', PGCONNECT_TIMEOUT: '20', PGSSLROOTCERT: caPath };
    const dir = resolve(process.env.BACKUP_DIR ?? '../.private/production/backups');
    const key = process.env.BACKUP_KEY_BASE64 ? Buffer.from(process.env.BACKUP_KEY_BASE64, 'base64')
        : await claveLocal(resolve('../.private/production/keys/backup.key'));
    const nombre = 'production-' + new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID().slice(0, 8) + '.dump.enc';
    const pgDump = process.env.PG_DUMP_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin/pg_dump.exe' : 'pg_dump');
    const pgRestore = process.env.PG_RESTORE_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin/pg_restore.exe' : 'pg_restore');
    await mkdir(dir, { recursive: true });
    const result = await crearArchivoCifrado({ pgDump, pgRestore, entorno, destino: join(dir, nombre), key });
    const manifest = { fechaUtc: new Date().toISOString(), archivo: nombre, base: 'neondb', rama: cfg.NEON_BRANCH_ID,
        proyecto: cfg.NEON_PROJECT_ID, lecturaExclusiva: true, ...result };
    await writeFile(join(dir, nombre + '.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
    await writeFile(resolve('../.private/production/ULTIMO_RESPALDO.json'), JSON.stringify({ directorio: dir, ...manifest }, null, 2));
    console.log(JSON.stringify(manifest));
    if (process.argv.includes('--r2')) {
        const { subirUltimoRespaldo } = await import('./backup/r2-upload.mjs');
        await subirUltimoRespaldo();
    }
}
respaldar().catch(error => { console.error('Respaldo production no completado:', {
    tipo: error.name, codigo: error.code ?? null, permisosInsuficientes: error.permissionDenied === true,
    diagnostico: error.diagnosticoSeguro,
}); process.exitCode = 1; });
