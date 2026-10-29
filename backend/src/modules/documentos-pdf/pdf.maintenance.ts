import { limpiarPdf } from './pdf.service.js';

/** Reintentos alojados en el backend, al arrancar y cada cinco minutos mientras está activo. */
export function iniciarMantenimientoPdf(): () => void {
    let ocupado = false;
    let detenido = false;
    const ejecutar = async () => {
        if (ocupado || detenido) return;
        ocupado = true;
        try { await limpiarPdf(10); }
        catch { console.error('Mantenimiento PDF no completado; se reintentará sin descartar pendientes.'); }
        finally { ocupado = false; }
    };
    const timer = setInterval(() => { void ejecutar(); }, 300_000);
    timer.unref();
    void ejecutar();
    return () => { detenido = true; clearInterval(timer); };
}
