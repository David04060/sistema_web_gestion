/** Archivo: Presenta fechas, autores, motivos y cambios legibles del historial recibido.
 */
import { cambioLegible, eventosDocumentales } from '../../../lib/historialDocumental';
import { fechaLocal } from '../../../lib/fechas';
import type { z } from 'zod';
import type { historialSchema } from '../../../api/documental';
import styles from '../../../components/ui/Admin.module.css';
export function HistorialDocumento({
  historial,
}: {
  historial: z.infer<typeof historialSchema>['historial'];
}) {
  return (
    <section className={styles.tarjeta}>
      <h2>Historial del documento</h2>
      {historial.length ? (
        <ol className={styles.historial}>
          {historial.map((h) => {
            const cambios = h.accion === 'REGISTRO' ? [] : cambioLegible(h.anterior, h.posterior);
            return (
              <li key={h.id} data-evento={h.id}>
                <article>
                  <header>
                    <h3>{eventosDocumentales[h.accion] ?? h.accion}</h3>
                    <time dateTime={h.fecha}>{fechaLocal(h.fecha)}</time>
                  </header>
                  <p className={styles.actorHistorial}>
                    Realizado por <strong>{h.actor}</strong>
                  </p>
                  {h.motivo && <p>Motivo: {h.motivo}</p>}
                  {!!cambios.length && (
                    <dl className={styles.cambiosHistorial}>
                      {cambios.map((v) => (
                        <div key={v.campo}>
                          <dt>{v.campo}</dt>
                          <dd>
                            {v.antes !== '—' && (
                              <>
                                <span>{v.antes}</span>
                                <span aria-label="cambió a"> → </span>
                              </>
                            )}
                            <strong>{v.despues}</strong>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </article>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles.vacio}>No hay eventos registrados.</p>
      )}
    </section>
  );
}
