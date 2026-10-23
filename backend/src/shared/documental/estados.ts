/** Cinco estados ya aprobados por PostgreSQL; el tipo no introduce valores ni transiciones en ejecución. */
export type EstadoDocumento = 'PENDIENTE_DECISION' | 'EN_TRASLADO' | 'RECIBIDO' | 'RECHAZADO' | 'CANCELADO';
/** Un movimiento solo existe después de la salida física; la decisión pertenece al documento. */
export type EstadoMovimiento = Exclude<EstadoDocumento, 'PENDIENTE_DECISION'>;
