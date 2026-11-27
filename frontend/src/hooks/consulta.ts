/** Archivo: Guarda el resultado de una consulta mientras su cuenta y filtros sigan vigentes.
 */
import { ApiError } from '../api/client';
interface EstadoConsulta<T> {
  consultar?: () => Promise<T>;
  contexto: string;
  datos: T | null;
  pendiente: boolean;
  error: string;
}
/** Conserva respuestas solo mientras existe la vista; descarta las que llegan fuera de orden. */
export class Consulta<T> {
  snapshot: EstadoConsulta<T> = { contexto: '', datos: null, pendiente: false, error: '' };
  private version = 0;
  private listener?: (estado: EstadoConsulta<T>) => void;
  /** Conecta la vista al resultado y devuelve una función para dejar de recibir cambios. */
  subscribe(listener: (estado: EstadoConsulta<T>) => void) {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }
  private publicar(estado: EstadoConsulta<T>) {
    this.snapshot = estado;
    this.listener?.(estado);
  }
  /** Invalida la respuesta pendiente; no interrumpe la solicitud de red que ya se envió. */
  cancelar() {
    this.version++;
  }
  /** Invalida consultas anteriores y borra los datos al cambiar o cerrar la sesión. */
  limpiar() {
    this.cancelar();
    this.publicar({ contexto: '', datos: null, pendiente: false, error: '' });
  }
  /** Conserva datos solo para la misma consulta y contexto. Una respuesta antigua no se publica. */
  async ejecutar(consultar: () => Promise<T>, contexto: string, conservar: boolean) {
    const version = ++this.version;
    const anterior = this.snapshot;
    const datos =
      conservar && anterior.consultar === consultar && anterior.contexto === contexto ? anterior.datos : null;
    this.publicar({ consultar, contexto, datos, pendiente: true, error: '' });
    try {
      const resultado = await consultar();
      if (version === this.version)
        this.publicar({ consultar, contexto, datos: resultado, pendiente: false, error: '' });
    } catch (fallo) {
      if (version !== this.version) return;
      // Un fallo temporal permite mantener lo ya visible; un rechazo de acceso borra esos datos.
      const red = fallo instanceof ApiError && (fallo.status === 0 || fallo.status >= 500);
      this.publicar({
        consultar,
        contexto,
        datos: red ? datos : null,
        pendiente: false,
        error: fallo instanceof Error ? fallo.message : 'No se pudo consultar la información.',
      });
    }
  }
}
