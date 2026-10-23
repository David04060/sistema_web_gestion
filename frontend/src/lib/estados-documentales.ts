/** Etiquetas de presentación de los cinco estados aprobados; no concede permisos ni define transiciones. */
export const etiquetasEstado: Readonly<Record<string, string>> = {
    PENDIENTE_DECISION: 'Pendiente de decisión',
    EN_TRASLADO: 'En traslado',
    RECIBIDO: 'Recibido',
    RECHAZADO: 'Rechazado',
    CANCELADO: 'Cancelado',
};
