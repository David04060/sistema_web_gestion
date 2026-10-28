/** Etiquetas de presentación del documento, su recorrido y las decisiones; no concede permisos ni define transiciones. */
export const etiquetasEstado: Readonly<Record<string, string>> = {
    SIN_DELEGACION: 'Sin delegación',
    DELEGADO: 'Delegado',
    ENTREGADO: 'Entregado',
    GUARDADO_DIRECCION: 'Guardado en Dirección',
    GUARDADO_SECRETARIA: 'Guardado en Secretaría',
    PENDIENTE_DECISION: 'Pendiente de decisión',
    EN_TRASLADO: 'En traslado',
    RECIBIDO: 'Recibido',
    RECHAZADO: 'Rechazado',
    CANCELADO: 'Cancelado',
};
