import { z } from 'zod';
import { historialSchema } from '../schemas/documentos.schema';
import { fechaLocal } from '../../../lib/fechas';
import styles from '../styles/Documentos.module.css';
const nombres: Record<string, string> = { asunto: 'Asunto', remitente: 'Remitente', observaciones: 'Observaciones', estado_tramite: 'Circulacion', activo: 'Registro vigente', archivador_id: 'Ubicación física (antecedente)', responsable_actual_id: 'Custodio', oficina_responsable_id: 'Oficina de custodia', destinatario_autorizado_id: 'Destinatario autorizado', oficina_destino_autorizada_id: 'Oficina autorizada', decision_autorizada_por_id: 'Usuario autorizante', registrado_por_id:'Registrador original',tipo_documental_id:'Tipo documental',codigo:'Código documental',_evento_documental: 'Acción y motivo' };
/**
 * Convierte valores de auditoría, incluidos pares antes/después, a texto legible sin interpretar HTML.
 * @param valor - Valor recibido que debe validarse, transformar o presentar.
 */
function mostrar(valor: unknown): string {
    if (valor === null)
        return 'Sin asignar';
    if (typeof valor === 'boolean')
        return valor ? 'Sí' : 'No';
    if (typeof valor !== 'object')
        return String(valor);
    return Object.entries(valor).map(/** Presenta un par de auditoría antes/después mediante la conversión recursiva segura a texto. */([k, v]) => `${k === 'antes' ? 'Antes' : k === 'despues' ? 'Después' : k === 'tipo' ? 'Acción' : k === 'motivo' ? 'Motivo' : k}: ${mostrar(v)}`).join('\n');
}
/** Conserva los valores historicos antes/despues sin interpretarlos como la ubicacion actual. */
export function DocumentoHistorial({ historial }: {
    historial: z.infer<typeof historialSchema>[];
}) {
    return <div className={styles.historial}>
        {historial.map(/** Presenta un evento auditado con actor, fecha y campos modificados. */  h => <article key={h.id}>
            <h3>
                {h.accion==='CREAR'?'Registro documental':'Actualización auditada'} · {fechaLocal(h.fecha)}
            </h3>
            <p>
                {h.actor || 'Actor no disponible'}
            </p>
            <dl>
                {Object.entries(h.campos_legibles??h.campos_modificados).filter(([campo])=>!['id','fecha_creacion','fecha_modificacion'].includes(campo)).map(/** Presenta el nombre del campo y su valor auditado sin interpretar contenido como HTML. */([campo, valor]) => <div key={campo}>
                    <dt>
                        {nombres[campo] ?? campo}
                    </dt>
                    <dd>
                        {mostrar(valor)}
                    </dd>
                </div>)}
            </dl>
        </article>)}
    </div>;
}
