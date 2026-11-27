/** Archivo: Conserva el punto de acceso público a las consultas, escrituras y validaciones documentales.
 */
/** Mantiene las mismas importaciones para rutas, PDF y pruebas. Las lecturas
 * y escrituras viven en módulos separados y comparten las reglas de autorización. */
export { id, alta, correccion, delegacion, ubicacion, anulacion, filtros } from './documental.schema.js';
export {
  opciones,
  buscarOrigenes,
  buscarUbicaciones,
  listar,
  detalle,
  historial,
  buscarDestinatarios,
  auditoria,
} from './documentos.consultas.js';
export { registrar, corregir, delegar, ubicar, anular } from './documentos.escrituras.js';
