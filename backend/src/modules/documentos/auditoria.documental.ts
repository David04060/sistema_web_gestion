/** Archivo: Selecciona cambios comprensibles del historial sin mostrar claves de archivos ni datos internos.
 */
import { etiquetasSituacion } from '../../shared/documental/presentacion.js';
const etiquetas: Record<string, string> = {
  ...etiquetasSituacion,
  PERSONAL: 'Personal',
  DELEGADO: 'Delegado',
  RECIBIDO: 'Recibido',
  EMITIDO: 'Emitido',
};
/** Lista permitida: nunca devuelve claves R2, IDs de cuenta ni JSON interno. */
export function datosAuditoria(anterior: unknown, posterior: unknown) {
  const anteriorPublico =
      anterior && typeof anterior === 'object' ? (anterior as Record<string, unknown>) : {},
    posteriorPublico =
      posterior && typeof posterior === 'object' ? (posterior as Record<string, unknown>) : {};
  const campos: Record<string, string> = {
    codigo_visible: 'Código documental',
    tipo_nombre_guardado: 'Tipo documental',
    clasificacion: 'Clasificación',
    asunto: 'Asunto',
    descripcion: 'Descripción de la acción',
    pdf_nombre: 'PDF de la acción',
    remitente: 'Remitente',
    observaciones: 'Observaciones',
    situacion: 'Situación',
    nombre: 'Nombre del PDF',
    tamano_bytes: 'Tamaño del PDF (bytes)',
    persona: 'Persona indicada',
    ruta: 'Ubicación',
  };
  const texto = (v: unknown) =>
    typeof v === 'string' && v.trim() ? (etiquetas[v] ?? v) : typeof v === 'number' ? String(v) : null;
  return Object.entries(campos).flatMap(([k, campo]) => {
    const antes = texto(anteriorPublico[k]),
      despues = texto(posteriorPublico[k]);
    return antes === despues ? [] : [{ campo, anterior: antes, posterior: despues }];
  });
}
