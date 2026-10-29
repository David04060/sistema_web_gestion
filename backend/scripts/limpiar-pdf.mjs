// Solo objetos previamente registrados por la aplicación. No enumera ni borra buckets ajenos.
import { limpiarPdf } from '../dist/modules/documentos-pdf/pdf.service.js';
import { cerrarBaseDatos, verificarBaseDatos } from '../dist/config/database.js';
try {
    await verificarBaseDatos();
    console.log(await limpiarPdf(50));
} catch { console.error('Limpieza PDF no completada; las tareas conservan su estado para reintento.'); process.exitCode=1; }
finally { await cerrarBaseDatos(); }
