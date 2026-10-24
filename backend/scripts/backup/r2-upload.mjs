import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
const sha = value => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

/** Firma S3 SigV4 con Node nativo; no imprime Authorization, claves ni cuerpos. */
async function s3(method, key, body = Buffer.alloc(0), query = {}) {
    const account = process.env.R2_ACCOUNT_ID, bucket = process.env.R2_BUCKET;
    if (!/^[a-f0-9]{32}$/.test(account ?? '') || !/^[a-z0-9][a-z0-9-]{2,62}$/.test(bucket ?? '')
        || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) throw new Error('Configuración R2 incompleta');
    const host = account + '.r2.cloudflarestorage.com';
    const path = '/' + bucket + (key ? '/' + key.split('/').map(encode).join('/') : '');
    const search = Object.entries(query).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => encode(k) + '=' + encode(v)).join('&');
    const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const day = date.slice(0, 8), hash = sha(body), signed = 'host;x-amz-content-sha256;x-amz-date';
    const canonical = [method, path, search, `host:${host}\nx-amz-content-sha256:${hash}\nx-amz-date:${date}\n`, signed, hash].join('\n');
    const scope = day + '/auto/s3/aws4_request';
    const signing = hmac(hmac(hmac(hmac('AWS4' + process.env.R2_SECRET_ACCESS_KEY, day), 'auto'), 's3'), 'aws4_request');
    const signature = createHmac('sha256', signing).update('AWS4-HMAC-SHA256\n' + date + '\n' + scope + '\n' + sha(canonical)).digest('hex');
    const respuesta = await fetch('https://' + host + path + (search ? '?' + search : ''), {
        method, headers: { 'x-amz-content-sha256': hash, 'x-amz-date': date,
            Authorization: `AWS4-HMAC-SHA256 Credential=${process.env.R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signed}, Signature=${signature}` },
        ...(method === 'PUT' ? { body } : {}), signal: globalThis.AbortSignal.timeout(120000),
    });
    if (!respuesta.ok) { await respuesta.body?.cancel(); throw new Error('R2 devolvió HTTP ' + respuesta.status); }
    return respuesta;
}

/** Cuenta todos los objetos del bucket; nunca borra respaldos para liberar espacio. */
async function bytesEnBucket() {
    let total = 0, token;
    for (let pagina = 0; pagina < 100; pagina++) {
        const r = await s3('GET', '', undefined, { 'list-type': '2', 'max-keys': '1000', ...(token ? { 'continuation-token': token } : {}) });
        const xml = await r.text();
        if (!xml.includes('ListBucketResult')) throw new Error('Respuesta de inventario R2 inválida');
        for (const match of xml.matchAll(/<Size>(\d+)<\/Size>/g)) total += Number(match[1]);
        if (!xml.includes('<IsTruncated>true</IsTruncated>')) return total;
        token = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1]
            ?.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'");
        if (!token) throw new Error('Paginación R2 incompleta');
    }
    throw new Error('Inventario R2 excede el máximo operativo');
}

/** Solo publica un archivo cifrado previamente verificado y su manifiesto sin claves. */
export async function subirUltimoRespaldo() {
    if (process.env.R2_PRIVATE_BUCKET_CONFIRMED !== 'true') throw new Error('Falta confirmar bucket privado');
    const manifest = JSON.parse(await readFile('../.private/production/ULTIMO_RESPALDO.json', 'utf8'));
    if (!manifest.legible || !manifest.integridadGcm || !manifest.pgRestoreSoloDecodificacion || manifest.algoritmo !== 'AES-256-GCM') {
        throw new Error('Respaldo sin verificación completa');
    }
    const { directorio, ...publicManifest } = manifest;
    if (!/^production-[a-zA-Z0-9.:-]+\.dump\.enc$/.test(manifest.archivo)) throw new Error('Nombre de respaldo inválido');
    const data = await readFile(join(directorio, manifest.archivo));
    if (data.length > 128 * 1024 * 1024 || sha(data) !== manifest.sha256) throw new Error('Tamaño o integridad de respaldo inválidos');
    const metadata = Buffer.from(JSON.stringify(publicManifest, null, 2));
    const usado = await bytesEnBucket();
    if (usado + data.length + metadata.length > 1024 * 1024 * 1024) throw new Error('Tope preventivo de 1 GiB alcanzado; no se sube ni borra nada');
    const key = 'production/' + manifest.archivo;
    await (await s3('PUT', key, data)).body?.cancel();
    await (await s3('PUT', key + '.json', metadata)).body?.cancel();
    const response = await s3('GET', key);
    const downloaded = Buffer.from(await response.arrayBuffer());
    if (sha(downloaded) !== manifest.sha256) throw new Error('Verificación de descarga R2 falló');
    console.log(JSON.stringify({ r2: true, cifrado: true, sha256VerificadoTrasDescarga: true, bytes: data.length }));
}
