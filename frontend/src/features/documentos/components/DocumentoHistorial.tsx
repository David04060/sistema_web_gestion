import { etiquetasEstado } from '../../../lib/estados-documentales';
import { z } from 'zod';
import { historialSchema } from '../schemas/documentos.schema';
import { fechaLocal } from '../../../lib/fechas';
import styles from '../styles/Documentos.module.css';
const acciones: Record<string,string> = {CREAR:'Registro',MODIFICAR:'Modificación',ELIMINAR:'Anulación',DECISION:'Decisión',MOVIMIENTO:'Movimiento',ANULACION:'Anulación',CORRECCION:'Corrección',UBICACION:'Cambio de ubicación',REGISTRO:'Registro'};
const nombres: Record<string, string> = { registrado_por_id:'Registrado por',tipo_documental_id:'Tipo documental',fecha_creacion:'Fecha de registro',fecha_modificacion:'Fecha de modificación', codigo:'Código', clasificacion_registro: 'Clasificación del registro', asunto: 'Asunto', remitente: 'Remitente', observaciones: 'Observaciones', estado_tramite: 'Circulación', activo: 'Registro vigente', archivador_id: 'Ubicación', responsable_actual_id: 'Responsable', oficina_responsable_id: 'Oficina', destinatario_autorizado_id: 'Destinatario autorizado', oficina_destino_autorizada_id: 'Oficina autorizada', decision_autorizada_por_id: 'Usuario autorizante', _evento_documental: 'Evento y motivo' };
/**
 * Convierte valores de auditoría, incluidos pares antes/después, a texto legible sin interpretar HTML.
 * @param valor - Valor recibido que debe validarse, transformar o presentar.
 */
function mostrar(valor: unknown, campo = ''): string {
    if (valor === null)
        return 'Sin asignar';
    if (typeof valor === 'boolean')
        return valor ? 'Sí' : 'No';
    if (typeof valor !== 'object') {
        const texto=String(valor);
        if(campo.startsWith('fecha') && Number.isFinite(Date.parse(texto)))return fechaLocal(texto);
        if(campo==='estado_tramite'||campo==='clasificacion_registro')return etiquetasEstado[texto]??texto;
        return campo==='tipo'?(acciones[texto]??texto):texto;
    }
    return Object.entries(valor).map(/** Presenta un par de auditoría antes/después mediante la conversión recursiva segura a texto. */([k, v]) => `${k === 'antes' ? 'Antes' : k === 'despues' ? 'Después' : k === 'tipo' ? 'Acción' : k === 'motivo' ? 'Motivo' : k}: ${mostrar(v,k==='antes'||k==='despues'?campo:k)}`).join('\n');
}
/** Conserva los valores historicos antes/despues sin interpretarlos como la ubicacion actual. */
export function DocumentoHistorial({ historial }: {
    historial: z.infer<typeof historialSchema>[];
}) {
    return <div className={styles.historial}>
        {historial.map(/** Presenta un evento auditado con actor, fecha y campos modificados. */  h => <article key={`${h.accion}-${h.id}`}>
            <h3>
                {acciones[String((h.campos_modificados._evento_documental as {tipo?:string}|undefined)?.tipo)]??acciones[h.accion]??h.accion} · {fechaLocal(h.fecha)}
            </h3>
            <p>
                {h.actor || 'Actor no disponible'}
            </p>
            {Object.keys(h.campos_presentacion??h.campos_modificados).length > 0 && <dl>
                {Object.entries(h.campos_presentacion??h.campos_modificados).map(/** Presenta el nombre del campo y su valor auditado sin interpretar contenido como HTML. */([campo, valor]) => <div key={campo}>
                    <dt>
                        {nombres[campo] ?? campo}
                    </dt>
                    <dd>
                        {mostrar(valor,campo)}
                    </dd>
                </div>)}
            </dl>}
        </article>)}
    </div>;
}
