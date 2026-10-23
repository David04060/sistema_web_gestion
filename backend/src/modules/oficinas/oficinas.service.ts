import { CatalogoService } from '../../shared/admin/catalogo.service.js';
import { repository } from './oficinas.repository.js';
/** Denominaciones institucionales reservadas, aprobadas; los registros se consultan desde PostgreSQL. */
export const service = new CatalogoService(repository, ["Dirección", "Mesa de Partes"]);
