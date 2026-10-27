import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, writeFile, appendFile, rename, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform, Writable } from 'node:stream';
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';

const MAGIC = Buffer.from('DOCBKP01');
/** Espera procesos sin publicar stderr, que puede contener metadatos privados. */
function proceso(binario, args, env) {
    const child = spawn(binario, args, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', b => { if (stderr.length < 65536) stderr += b; });
    const done = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', code => {
            let seguro = stderr.split(/\r?\n/).slice(0, 4).join(' ');
            for (const valor of [env.PGPASSWORD, env.PGHOST, env.PGUSER, env.PGDATABASE]) {
                if (valor) seguro = seguro.replaceAll(valor, '[privado]');
            }
            code === 0 ? resolve() : reject(Object.assign(new Error('Herramienta PostgreSQL no completó el respaldo'),
                { code: 'PG_TOOL_FAILED', permissionDenied: /permission denied/i.test(stderr), diagnosticoSeguro: seguro }));
        });
    });
    // Registrar pronto un manejador evita una promesa rechazada pendiente durante pipelines.
    void done.catch(() => {});
    return { child, done };
}

/** pg_dump va directamente a AES-256-GCM; nunca escribe un volcado en claro. */
export async function crearArchivoCifrado({ pgDump, pgRestore, entorno, destino, key }) {
    if (key.length !== 32) throw new Error('Clave AES inválida');
    await mkdir(dirname(destino), { recursive: true });
    const iv = randomBytes(12), header = Buffer.concat([MAGIC, iv]);
    const partial = destino + '.partial';
    await writeFile(partial, header, { flag: 'wx', mode: 0o600 });
    const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(header);
    const digest = createHash('sha256');
    const tap = new Transform({ transform(chunk, _encoding, cb) { digest.update(chunk); cb(null, chunk); } });
    const { child, done } = proceso(pgDump, ['--format=custom', '--no-password'], entorno);
    child.stdin.end();
    try {
        await Promise.all([pipeline(child.stdout, tap, cipher, createWriteStream(partial, { flags: 'a' })), done]);
        await appendFile(partial, cipher.getAuthTag());
        await rename(partial, destino);
    } catch (error) { child.kill(); await done.catch(() => {}); throw error; }
    const plainSha256 = digest.digest('hex');
    const validacion = await verificarArchivoCifrado({ archivo: destino, key, pgRestore, entorno, plainSha256 });
    const hash = createHash('sha256');
    await pipeline(createReadStream(destino), new Writable({ write(chunk, _enc, cb) { hash.update(chunk); cb(); } }));
    return { ...validacion, sha256: hash.digest('hex'), bytes: (await stat(destino)).size,
        keyId: createHash('sha256').update(key).digest('hex').slice(0, 16), algoritmo: 'AES-256-GCM' };
}

/** Autentica todo el cifrado, comprueba el hash del dump y decodifica todos sus datos sin restaurarlos. */
export async function verificarArchivoCifrado({ archivo, key, pgRestore, entorno, plainSha256 }) {
    const size = (await stat(archivo)).size;
    if (size <= 36) throw new Error('Archivo cifrado incompleto');
    const fh = await open(archivo, 'r');
    const header = Buffer.alloc(20), tag = Buffer.alloc(16);
    try { await fh.read(header, 0, 20, 0); await fh.read(tag, 0, 16, size - 16); } finally { await fh.close(); }
    if (!header.subarray(0, 8).equals(MAGIC)) throw new Error('Formato de respaldo desconocido');
    const decrypt = () => {
        const d = createDecipheriv('aes-256-gcm', key, header.subarray(8)); d.setAAD(header); d.setAuthTag(tag); return d;
    };
    const hash = createHash('sha256');
    await pipeline(createReadStream(archivo, { start: 20, end: size - 17 }), decrypt(),
        new Writable({ write(chunk, _enc, cb) { hash.update(chunk); cb(); } }));
    if (hash.digest('hex') !== plainSha256) throw new Error('Hash del volcado descifrado no coincide');
    const sqlHash = createHash('sha256'); let sqlBytes = 0;
    const { child, done } = proceso(pgRestore, ['--file=-'], entorno);
    try {
        await Promise.all([
            pipeline(createReadStream(archivo, { start: 20, end: size - 17 }), decrypt(), child.stdin),
            pipeline(child.stdout, new Writable({ write(chunk, _enc, cb) { sqlHash.update(chunk); sqlBytes += chunk.length; cb(); } })), done,
        ]);
    } catch (error) { child.kill(); await done.catch(() => {}); throw error; }
    if (sqlBytes === 0) throw new Error('pg_restore no decodificó contenido');
    return { legible: true, integridadGcm: true, pgRestoreSoloDecodificacion: true, sqlBytes,
        plainSha256, sqlSha256: sqlHash.digest('hex') };
}

/** Clave local separada de los archivos de backup; no se transmite al bucket. */
export async function claveLocal(archivo) {
    await mkdir(dirname(archivo), { recursive: true });
    try { await writeFile(archivo, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const key = await readFile(archivo);
    if (key.length !== 32) throw new Error('Clave local inválida');
    return key;
}
