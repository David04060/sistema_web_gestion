import { etiquetas } from '../api/documental';

const campos: Record<string, string> = {
  asunto: 'Asunto',
  remitente: 'Remitente',
  observaciones: 'Observaciones',
  situacion: 'Situación',
  nombre: 'Nombre del PDF',
  tamano_bytes: 'Tamaño en bytes',
  persona: 'Persona indicada',
  ruta: 'Ubicación',
};
export const eventosDocumentales: Record<string, string> = {
  REGISTRO: 'Registro',
  CORRECCION: 'Corrección',
  ANULACION: 'Anulación',
  DELEGACION: 'Delegación indicada',
  UBICACION: 'Ubicación',
  CAMPO_REGISTRADO: 'Campo registrado',
  PDF_CARGA: 'PDF adjuntado',
  PDF_REEMPLAZO: 'PDF actualizado',
  PDF_ELIMINACION: 'PDF eliminado',
  PDF_LIMPIEZA_PENDIENTE: 'Limpieza de PDF pendiente',
  PDF_LIMPIEZA_COMPLETADA: 'Limpieza de PDF completada',
};

/** Lista explícita de datos legibles: no vuelca JSON interno ni referencias privadas. */
export function cambioLegible(antes: unknown, despues: unknown) {
  const a = antes && typeof antes === 'object' ? (antes as Record<string, unknown>) : {},
    b = despues && typeof despues === 'object' ? (despues as Record<string, unknown>) : {};
  const texto = (v: unknown) =>
    v === null || v === undefined || (typeof v === 'string' && !v.trim())
      ? '—'
      : (etiquetas[String(v)] ?? String(v));
  const cambios = Object.keys(campos)
    .filter((k) => a[k] !== b[k] && (a[k] !== undefined || b[k] !== undefined))
    .map((k) => ({ campo: campos[k], antes: texto(a[k]), despues: texto(b[k]) }));
  if (a.valor !== b.valor && (a.valor !== undefined || b.valor !== undefined))
    cambios.push({
      campo: String(b.nombre_guardado ?? a.nombre_guardado ?? 'Valor de campo opcional'),
      antes: texto(a.valor),
      despues: texto(b.valor),
    });
  return cambios.filter((c) => c.antes !== c.despues);
}
