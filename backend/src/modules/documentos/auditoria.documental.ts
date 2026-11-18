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
    remitente: 'Remitente',
    observaciones: 'Observaciones',
    situacion: 'Situación',
    nombre: 'Nombre del PDF',
    tamano_bytes: 'Tamaño del PDF (bytes)',
    persona: 'Persona indicada',
    ruta: 'Ubicación',
  };
  if ('valor' in anteriorPublico || 'valor' in posteriorPublico)
    campos.valor = String(
      posteriorPublico.nombre_guardado ?? anteriorPublico.nombre_guardado ?? 'Campo opcional',
    );
  const texto = (v: unknown) =>
    typeof v === 'string' && v.trim()
      ? (etiquetas[v] ?? v)
      : typeof v === 'number'
        ? String(v)
        : null;
  return Object.entries(campos).flatMap(([k, campo]) => {
    const antes = texto(anteriorPublico[k]),
      despues = texto(posteriorPublico[k]);
    return antes === despues ? [] : [{ campo, anterior: antes, posterior: despues }];
  });
}
