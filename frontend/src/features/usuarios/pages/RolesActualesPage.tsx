import { useCallback } from 'react';
import { config } from '../../../api/documental';
import styles from '../../../components/ui/Admin.module.css';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { useConsulta } from '../../../hooks/useConsulta';
import { useAuth } from '../../auth/hooks/useAuth';
export { OficinasActualesPage } from './OficinasPages';
export function RolesActualesPage() {
  const { token } = useAuth().sesion!;
  const consulta = useConsulta(useCallback(() => config.roles(token), [token]));
  return (
    <main className={styles.pagina}>
      <h1>Roles del sistema</h1>
      <EstadoCarga {...consulta} reintentar={consulta.recargar} />
      {consulta.datos && (
        <section className={styles.tarjeta}>
          <ul>
            {consulta.datos.roles.map((r) => (
              <li key={r.id}>{r.nombre}</li>
            ))}
          </ul>
          <p>Asigna el rol desde el detalle de cada cuenta.</p>
        </section>
      )}
    </main>
  );
}
