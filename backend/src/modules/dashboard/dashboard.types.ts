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
    clasificacion_registro?: 'RECIBIDO' | 'EMITIDO' | null;
    activo?: boolean;
    fecha: string;
    ruta: string;
}
export interface Dashboard {
    atencion: {
        titulo: string;
        situacion: 'PENDIENTE_DECISION' | 'DELEGADO';
        total: number;
        documentos: (EntradaDashboard & {asunto:string;tipo_documental:string;destinatario:string|null})[];
    } | null;
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
