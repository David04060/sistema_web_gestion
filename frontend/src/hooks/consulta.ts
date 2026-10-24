import { ApiError } from '../api/client';
interface EstadoConsulta<T> {
    consultar?: () => Promise<T>;
    contexto: string;
    datos: T | null;
    pendiente: boolean;
    error: string;
}
/** Memoria exclusiva del montaje y control de carreras; nunca persiste ni comparte respuestas. */
export class Consulta<T> {
    snapshot: EstadoConsulta<T> = { contexto: '', datos: null, pendiente: false, error: '' };
    private version = 0;
    private listener?: (estado: EstadoConsulta<T>) => void;
    subscribe(listener: (estado: EstadoConsulta<T>) => void) { this.listener = listener; return () => { this.listener = undefined; }; }
    private publicar(estado: EstadoConsulta<T>) { this.snapshot = estado; this.listener?.(estado); }
    cancelar() { this.version++; }
    limpiar() { this.cancelar(); this.publicar({ contexto: '', datos: null, pendiente: false, error: '' }); }
    async ejecutar(consultar: () => Promise<T>, contexto: string, conservar: boolean) {
        const version = ++this.version;
        const anterior = this.snapshot;
        const datos = conservar && anterior.consultar === consultar && anterior.contexto === contexto ? anterior.datos : null;
        this.publicar({ consultar, contexto, datos, pendiente: true, error: '' });
        try {
            const resultado = await consultar();
            if (version === this.version) this.publicar({ consultar, contexto, datos: resultado, pendiente: false, error: '' });
        } catch (fallo) {
            if (version !== this.version) return;
            const red = fallo instanceof ApiError && (fallo.status === 0 || fallo.status >= 500);
            this.publicar({ consultar, contexto, datos: red ? datos : null, pendiente: false,
                error: fallo instanceof Error ? fallo.message : 'No se pudo consultar la información.' });
        }
    }
}
