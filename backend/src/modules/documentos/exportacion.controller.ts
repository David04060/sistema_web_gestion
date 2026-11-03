import type { Response, NextFunction } from 'express';
import type { RequestAutenticada } from '../../middlewares/auth.middleware.js';
import { validar } from '../../shared/http/validar.js';
import { periodoExportacion, prepararExportacion } from './exportacion.excel.js';

/** Entrega el XLSX completo y retira el temporal al finalizar; cerrar la conexión cancela la preparación. */
export async function descargarExcel(q: RequestAutenticada, r: Response, next: NextFunction) {
  const periodo = validar(periodoExportacion, q.query),
    control = new AbortController();
  const cerrar = () => control.abort();
  r.once('close', cerrar);
  try {
    const archivo = await prepararExportacion(q.usuario!.id, periodo, control.signal);
    if (control.signal.aborted) {
      await archivo.limpiar();
      return;
    }
    r.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    r.setHeader('X-Export-Total', String(archivo.total));
    r.setHeader('X-Export-Generated-At', archivo.actualizado);
    r.download(archivo.ruta, archivo.nombre, (error) => {
      void archivo
        .limpiar()
        .catch(() => console.error('No se pudo limpiar el archivo temporal de Excel'));
      if (error && !r.headersSent && !control.signal.aborted) next(error);
    });
  } catch (error) {
    if (!control.signal.aborted) next(error);
  }
}
