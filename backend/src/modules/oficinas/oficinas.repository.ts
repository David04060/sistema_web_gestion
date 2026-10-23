import { CatalogoRepository } from '../../shared/admin/catalogo.repository.js';
/** Repositorio del catálogo oficinas; no acepta nombres de tablas del cliente. */
export const repository = new CatalogoRepository('oficinas');
