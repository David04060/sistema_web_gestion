import { z } from 'zod';
import { nombreCatalogo } from '../../shared/admin/admin.schema.js';
/** El catálogo solo dispone del nombre como campo editable en el esquema actual. */
export const guardarSchema = z.object({ nombre: nombreCatalogo(100) }).strict();
