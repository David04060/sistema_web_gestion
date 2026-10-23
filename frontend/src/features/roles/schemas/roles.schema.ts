import { z } from 'zod';
/** Límites del catálogo real de PostgreSQL; nombres no vacíos y espacios normalizados. */
export const guardarSchema = z.object({ nombre: z.string().trim().transform(/** Colapsa espacios interiores del nombre antes de validar el catálogo de roles. */  valor => valor.replace(/\s+/gu, ' ')).pipe(z.string().min(1, 'El nombre es obligatorio').max(100)) }).strict();
