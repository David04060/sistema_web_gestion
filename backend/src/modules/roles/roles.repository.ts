import { CatalogoRepository } from '../../shared/admin/catalogo.repository.js';
/** Repositorio del catálogo roles; no acepta nombres de tablas del cliente. */
export const repository = new CatalogoRepository('roles');
