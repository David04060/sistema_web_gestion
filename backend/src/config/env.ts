import { config } from "dotenv";
import { z } from "zod";
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
/** El perfil remoto es explícito y nunca combina archivos locales y remotos. */
const perfil = process.argv.includes('--neon-qa') ? 'neon-qa'
    : process.argv.includes('--neon') ? 'neon' : (process.env.DB_PROFILE ?? 'local');
const administrado = process.env.RENDER === 'true';
if (!['local', 'neon', 'neon-qa'].includes(perfil) || (administrado && perfil !== 'neon-qa')) {
    console.error('Perfil PostgreSQL inválido. Render requiere explícitamente DB_PROFILE=neon-qa.');
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
if ((perfilQa && !/^br-[a-z0-9-]+$/.test(process.env.NEON_BRANCH_ID ?? ''))
    || (administrado && (!process.env.NEON_QA_HOST || env.CORS_ORIGINS.length === 0 || env.TRUST_PROXY_HOPS !== 1))) {
    console.error('QA requiere NEON_BRANCH_ID; Render requiere además NEON_QA_HOST, CORS_ORIGINS y TRUST_PROXY_HOPS=1.');
    process.exit(1);
}
if (perfilNeon) {
    let valida = false;
    try {
        const url = new URL(env.DATABASE_URL);
        valida = ["postgres:", "postgresql:"].includes(url.protocol)
            && decodeURIComponent(url.username) === "sistema_web_app"
            && url.pathname === "/neondb"
            && url.hostname.endsWith(".neon.tech")
            && !url.hostname.includes("-pooler")
            && (!process.env.NEON_QA_HOST || !perfilQa || url.hostname === process.env.NEON_QA_HOST)
            && url.searchParams.get("sslmode") === "verify-full"
            && !["sslcert", "sslkey", "sslrootcert", "uselibpqcompat"].some(key => url.searchParams.has(key));
    }
    catch { /* La URL nunca forma parte del diagnóstico. */ }
    if (!valida) {
        console.error("Neon requiere conexión directa a neondb con sistema_web_app y sslmode=verify-full.");
        process.exit(1);
    }
}
