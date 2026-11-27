/** Archivo: Ejecuta la limpieza de PDF registrados por el sistema y cierra las conexiones al terminar.
 */
// Solo objetos previamente registrados por la aplicación. No enumera ni borra buckets ajenos.
import { pdfActual } from '../dist/modules/documentos-pdf/pdf.documental.js';
import { cerrarBaseDatos, verificarBaseDatos } from '../dist/config/database.js';
try {
  await verificarBaseDatos();
  console.log(await pdfActual.limpiar(50));
} catch {
  console.error('Limpieza PDF no completada; las tareas conservan su estado para reintento.');
  process.exitCode = 1;
} finally {
  await cerrarBaseDatos();
}
