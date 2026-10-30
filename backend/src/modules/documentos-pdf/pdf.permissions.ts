import type { ActorDocumental } from '../../shared/documental/transaccion.js';
import type { Documento } from '../documentos/documentos.repository.js';

export interface DecisionPdf { situacion: string; tipo: string | null; usuario_id: string | null }
/** Permiso específico de adjunto: no modifica custodia, contenido ni decisiones documentales. */
export function puedeGestionarPdfInstitucional(actor: ActorDocumental, d: Documento, decision: DecisionPdf | undefined): boolean {
    if (!actor.activo || !d.activo || !['Director(a)','Secretaria de Dirección'].includes(actor.rol)
        || !['RECIBIDO','PENDIENTE_DECISION'].includes(d.estado_tramite)) return false;
    // La delegación informativa y el guardado no retiran la responsabilidad vigente.
    if (d.responsable_actual_id === actor.id) return true;
    if (actor.rol === 'Director(a)') return false;
    if (d.responsable_actual_id !== actor.id && !['Dirección','Mesa de Partes'].includes(d.oficina)) return false;
    if (decision && ['DELEGADO','ENTREGADO'].includes(decision.situacion))
        return decision.tipo === 'PERSONA' && decision.usuario_id === null;
    if (decision?.situacion === 'GUARDADO_DIRECCION') return true;
    if (decision?.situacion === 'GUARDADO_SECRETARIA') return actor.rol === 'Secretaria de Dirección';
    if (!['Dirección','Mesa de Partes'].includes(d.oficina)) return false;
    if (d.estado_tramite === 'PENDIENTE_DECISION') return true;
    return d.oficina === 'Dirección' || actor.rol === 'Secretaria de Dirección';
}
