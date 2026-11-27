/** Archivo: Comparte el criterio SQL de pertenencia y actividad de una ubicación.
 */
/** Los parámetros son cuenta ($1) y oficina ($2). Esta condición se aplica
 * tanto al buscar ubicaciones como al comprobar cada antecesor antes de guardar. */
export const unidadPropiaActiva = 'u.propietario_id=$1 AND u.oficina_id=$2 AND u.activo';
