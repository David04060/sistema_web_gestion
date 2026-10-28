export const clasificacionesRegistro = ['RECIBIDO', 'EMITIDO'] as const;
export type ClasificacionRegistro = typeof clasificacionesRegistro[number];
/** La ausencia de dato histórico nunca se deduce de la circulación. */
export function etiquetaClasificacion(valor: ClasificacionRegistro | null) {
    return valor === 'RECIBIDO' ? 'Recibido' : valor === 'EMITIDO' ? 'Emitido' : 'Sin clasificación';
}
