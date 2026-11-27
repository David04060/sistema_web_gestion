/** Archivo: Consulta detalles adicionales de auditoría solo cuando se abre su sección.
 */
import { useCallback, useState } from 'react';
import { api } from '../../../api/documental';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { eventosDocumentales } from '../../../lib/historialDocumental';
import { fechaLocal } from '../../../lib/fechas';
import styles from '../../../components/ui/Admin.module.css';
export function AuditoriaDocumento({
  token,
  id,
  revision,
}: {
  token: string;
  id: string;
  revision?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const consulta = useConsulta(
    useCallback(() => api.auditoria(token, id), [token, id, revision]),
    { habilitada: abierto },
  );
  return (
    <section className={styles.tarjeta}>
      <button
        className={styles.secundario}
        aria-expanded={abierto}
        aria-controls={'auditoria-' + id}
        onClick={() => setAbierto((v) => !v)}
      >
        {abierto ? 'Ocultar auditoría' : 'Ver más detalles de auditoría'}
      </button>
      {abierto && (
        <div id={'auditoria-' + id}>
          <h2 className={styles.tituloAuditoria}>Auditoría detallada</h2>
          <EstadoCarga {...consulta} reintentar={consulta.recargar} />
          {consulta.datos && (
            <ol className={styles.historial}>
              {consulta.datos.eventos.map((e) => (
                <li key={e.id}>
                  <article>
                    <header>
                      <h3>{eventosDocumentales[e.accion] ?? e.accion}</h3>
                      <time dateTime={e.fecha}>{fechaLocal(e.fecha)}</time>
                    </header>
                    {e.actor && (
                      <p>
                        Realizado por <strong>{e.actor}</strong>
                      </p>
                    )}
                    {e.motivo && <p>Motivo: {e.motivo}</p>}
                    <dl className={styles.cambiosHistorial}>
                      {e.datos.map((d) => (
                        <div key={d.campo}>
                          <dt>{d.campo}</dt>
                          <dd>
                            {d.anterior !== null && (
                              <p>
                                <strong>Anterior: </strong>
                                {d.anterior}
                              </p>
                            )}
                            {d.posterior !== null && (
                              <p>
                                <strong>{d.anterior === null ? 'Valor registrado: ' : 'Posterior: '}</strong>
                                {d.posterior}
                              </p>
                            )}
                            {d.posterior === null && <p>Valor retirado</p>}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
