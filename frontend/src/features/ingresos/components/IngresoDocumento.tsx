import type { Ingreso } from '../schemas/ingresos.schema';
import { fechaLocal } from '../../../lib/fechas';
import styles from '../../../components/ui/Admin.module.css';

/** El acceso documental ya se comprobó en el backend; no consulta ingresos ajenos. */
export function IngresoDocumento({ ingreso }: { ingreso: Ingreso | null }) {
    return <section className={styles.tarjeta} aria-labelledby="ingreso-documental">
        <h2 id="ingreso-documental">Ingreso por Mesa de Partes</h2>
        {!ingreso ? <p>Este documento no tiene un ingreso por Mesa de Partes registrado. Su identidad y archivo institucional existen de forma independiente del trámite.</p> : <>
            <p><strong>{ingreso.referencia}</strong> · Primer ingreso ordinario. El código documental identifica el original; esta referencia identifica su presentación al trámite.</p>
            <dl className={styles.datos}>
                <div><dt>Origen del primer ingreso</dt><dd>{ingreso.movimiento_recepcion_id ? 'Documento existente recibido en entrega institucional' : 'Original externo registrado conjuntamente'}</dd></div>
                <div><dt>Propósito de la gestión</dt><dd>{ingreso.proposito}</dd></div>
                <div><dt>Fecha de presentación</dt><dd>{fechaLocal(ingreso.fecha_presentacion)}</dd></div>
                <div><dt>Presentante</dt><dd>{ingreso.presentante}</dd></div>
                <div><dt>Procedencia</dt><dd>{ingreso.procedencia}</dd></div>
                <div><dt>Registrado por Secretaría</dt><dd>{ingreso.registradora}</dd></div>
                <div><dt>Fecha de registro del ingreso</dt><dd>{fechaLocal(ingreso.fecha_ingreso)}</dd></div>
            </dl>
            <p>La recepción de un movimiento no concluye el ingreso. Esta etapa no ofrece conclusión, invalidación, continuaciones ni reingresos.</p>
        </>}
    </section>;
}
