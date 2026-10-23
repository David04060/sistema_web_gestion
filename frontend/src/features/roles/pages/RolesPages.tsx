import { CatalogoLista, CatalogoDetalle, CatalogoFormulario } from '../../../components/ui/CatalogoPages';
import { api } from '../api/roles.api';
import { guardarSchema } from '../schemas/roles.schema';
const props = { titulo: 'Roles', singular: 'Rol', ruta: '/roles', api, schema: guardarSchema };
/** Las páginas reutilizan presentación común sin mezclar el transporte HTTP del módulo. */
export const Lista = () => <CatalogoLista {...props} />;
/**
 * Configura el detalle compartido y las cuentas asociadas al catálogo de roles.
 */
export const Detalle = () => <CatalogoDetalle {...props} />;
/**
 * Configura el formulario compartido con la validación y API del catálogo de roles.
 */
export const Formulario = () => <CatalogoFormulario {...props} />;
