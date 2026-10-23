/** Contrato del panel: contadores SQL, listas acotadas y enlaces autorizados. */
export interface Indicador {
    clave: string;
    etiqueta: string;
    total: number;
}
export interface EntradaDashboard {
    id: string;
    codigo: string;
    estado: string;
    fecha: string;
    ruta: string;
}
export interface Dashboard {
    alcance: 'administrativo' | 'institucional' | 'personal';
    actualizado: string;
    indicadores: Indicador[];
    estados: Indicador[];
    operaciones: Indicador[];
    recientes: EntradaDashboard[];
    pendientes: EntradaDashboard[];
    accesos: {
        etiqueta: string;
        ruta: string;
    }[];
}
