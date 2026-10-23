import { CatalogoService } from '../../shared/admin/catalogo.service.js';
import { repository } from './roles.repository.js';
/** Denominaciones institucionales reservadas, aprobadas; los registros se consultan desde PostgreSQL. */
export const service = new CatalogoService(repository, ["Administrador", "Director(a)", "Secretaria de Dirección", "Usuario"]);
