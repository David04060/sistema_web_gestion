import { CatalogoLista, CatalogoDetalle, CatalogoFormulario } from '../../../components/ui/CatalogoPages';
import { api } from '../api/oficinas.api';
import { guardarSchema } from '../schemas/oficinas.schema';
const props = { titulo: 'Oficinas', singular: 'Oficina', ruta: '/oficinas', api, schema: guardarSchema };
/** Las páginas reutilizan presentación común sin mezclar el transporte HTTP del módulo. */
export const Lista = () => <CatalogoLista {...props} />;
/**
 * Configura el detalle compartido y las cuentas asociadas al catálogo de oficinas.
 */
export const Detalle = () => <CatalogoDetalle {...props} />;
/**
 * Configura el formulario compartido con la validación y API del catálogo de oficinas.
 */
export const Formulario = () => <CatalogoFormulario {...props} />;
