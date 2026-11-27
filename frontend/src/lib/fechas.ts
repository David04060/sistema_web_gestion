/** Archivo: Presenta fechas con formato peruano y la zona horaria del navegador.
 */
/** Presenta timestamps de PostgreSQL sin alterar el instante almacenado. */
export function fechaLocal(fecha: string): string {
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(fecha),
  );
}
