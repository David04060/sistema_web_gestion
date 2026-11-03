/** Error previsto del dominio; solo su mensaje público se envía al cliente. */
export class HttpError extends Error {
  /**
   * Crea un error de negocio con estado y mensaje público para que el middleware HTTP lo traduzca sin exponer detalles internos.
   * @param status - Estado HTTP o cero si no se recibió una respuesta.
   * @param mensaje - Mensaje público que acompaña la transición.
   */
  constructor(
    public readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'HttpError';
  }
}
