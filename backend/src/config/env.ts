import { config } from "dotenv";
import { z } from "zod";
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { validarUrlNeon } from './neon.js';
/** El perfil remoto es explícito y nunca combina archivos locales y remotos. */
const perfil = process.argv.includes('--neon-qa') ? 'neon-qa'
    : process.argv.includes('--neon') ? 'neon' : (process.env.DB_PROFILE ?? 'local');
const administrado = process.env.RENDER === 'true';
if (!['local', 'neon', 'neon-qa'].includes(perfil) || (administrado && perfil !== 'neon')) {
    console.error('Perfil PostgreSQL inválido. Render requiere explícitamente DB_PROFILE=neon.');
    process.exit(1);
}
export const perfilQa = perfil === 'neon-qa';
if (perfilQa && !administrado) {
    try {
        const qa = parse(readFileSync('.env.neon.qa'));
        const principal = parse(readFileSync('.env.neon'));
        if (new URL(qa.DATABASE_URL!).hostname === new URL(principal.DATABASE_URL!).hostname
            || !/^br-[a-z0-9-]+$/.test(qa.NEON_BRANCH_ID ?? '')) throw new Error();
    } catch {
        console.error('QA requiere un host distinto del principal y NEON_BRANCH_ID independiente.');
        process.exit(1);
    }
}
export const perfilNeon = perfil === 'neon' || perfilQa;
const archivo = perfilQa ? '.env.neon.qa' : perfilNeon ? ".env.neon" : (process.env.DOTENV_CONFIG_PATH ?? ".env");
// Render suministra secretos y PORT; nunca carga ni necesita archivos privados del equipo.
const carga = administrado ? {} : config({ path: archivo, quiet: true, override: perfilNeon });
if (perfilNeon && carga.error) {
    console.error("No se pudo cargar el archivo privado .env.neon.");
    process.exit(1);
}
/** Falla antes de abrir conexiones si falta configuración; no registra los valores recibidos. */
const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"])
        .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535)
        .default(3000),
    DATABASE_URL: z.string().min(1),
    VINCULACION_ARCHIVOS_HABILITADA: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
    PRIMER_INGRESO_ORDINARIO_HABILITADO: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
    CICLO_INGRESOS_ORDINARIOS_HABILITADO: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
    RELEVOS_HABILITADOS: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
    SUSTITUCIONES_HABILITADAS: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
    CORRECCIONES_VERSIONADAS_HABILITADAS: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
    ACTUALIZACION_ARCHIVISTICA_PRODUCCION: z.string().default(''),
    JWT_SECRET: z.string().min(32),
    CORS_ORIGINS: z.string().default('').transform(valor => valor.split(',').map(origen => origen.trim()).filter(Boolean))
        .refine(origenes => origenes.every(origen => {
            try {
                const url = new URL(origen);
                return url.origin === origen && (url.protocol === 'https:'
                    || (!administrado && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)));
            } catch { return false; }
        }), 'CORS requiere orígenes explícitos sin rutas ni comodines'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(1).default(0),
});
const result = envSchema.safeParse(process.env);
if (!result.success) {
    console.error("Error en las variables de entorno:", result.error.flatten().fieldErrors);
    process.exit(1);
}
export const env = result.data;
if (env.PRIMER_INGRESO_ORDINARIO_HABILITADO && !env.VINCULACION_ARCHIVOS_HABILITADA)
    throw new Error('Primer ingreso ordinario requiere vinculación archivística habilitada en QA');
if (env.CICLO_INGRESOS_ORDINARIOS_HABILITADO && !env.PRIMER_INGRESO_ORDINARIO_HABILITADO)
    throw new Error('Ciclo ordinario requiere primer ingreso habilitado en QA');
// Esta entrega solo habilita la capacidad en procesos contra la copia QA local.
if (env.VINCULACION_ARCHIVOS_HABILITADA) {
    const destino = new URL(env.DATABASE_URL);
    const qaLocal = !administrado && ['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname)
        && /^\/sistema_web_final_qa_archivo_[a-f0-9]{32}$/.test(destino.pathname);
    const produccionExplicita = perfilNeon && !perfilQa && env.NODE_ENV === 'production'
        && env.ACTUALIZACION_ARCHIVISTICA_PRODUCCION === '20261026-archivo-v1';
    if (!qaLocal && !produccionExplicita) {
        throw new Error('La vinculación requiere QA local o activación explícita de la versión de producción');
    }
}
if ((env.RELEVOS_HABILITADOS || env.SUSTITUCIONES_HABILITADAS) && !env.VINCULACION_ARCHIVOS_HABILITADA)
    throw new Error('Relevos y sustituciones requieren integración archivística');
if ((perfilQa && !/^br-[a-z0-9-]+$/.test(process.env.NEON_BRANCH_ID ?? ''))
    || (administrado && (!/^br-[a-z0-9-]+$/.test(process.env.NEON_BRANCH_ID ?? '')
        || !process.env.NEON_HOST || env.CORS_ORIGINS.length === 0 || env.TRUST_PROXY_HOPS !== 1
        || env.NODE_ENV !== 'production' || env.JWT_SECRET.startsWith('REEMPLAZAR_')))) {
    console.error('Render requiere NODE_ENV=production, NEON_BRANCH_ID, NEON_HOST, CORS_ORIGINS, JWT_SECRET vigente y TRUST_PROXY_HOPS=1.');
    process.exit(1);
}
if (perfilNeon) {
    const hostEsperado = administrado ? process.env.NEON_HOST
        : perfilQa ? process.env.NEON_QA_HOST : process.env.NEON_HOST;
    if (!validarUrlNeon(env.DATABASE_URL, hostEsperado)) {
        console.error("Neon requiere conexión directa a neondb con sistema_web_app y sslmode=verify-full.");
        process.exit(1);
    }
}
