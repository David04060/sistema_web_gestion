/** Archivo: Representa un rechazo previsto con su estado HTTP y un mensaje apto para mostrar en pantalla.
 */
/** Error previsto del dominio; solo su mensaje público se envía al cliente. */
export class HttpError extends Error {
  /**
   * Conserva un estado HTTP y un mensaje seguro para responder desde la API.
   * Por ejemplo, 403 rechaza una acción sin permiso y 409 indica un conflicto.
   */
  constructor(
    public readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'HttpError';
  }
}
