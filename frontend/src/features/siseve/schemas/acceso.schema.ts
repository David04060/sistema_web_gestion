import { z } from 'zod';
/** Metadato propio de navegación; nunca sustituye la clave por operación ni los permisos del backend. */
export const accesoSchema = z.object({ tipo_documental_id: z.string(), autorizado: z.boolean(), clave_configurada:z.boolean().optional(), administrador: z.boolean(), puede_registrar: z.boolean() });
export type AccesoSiseve = z.infer<typeof accesoSchema>;
