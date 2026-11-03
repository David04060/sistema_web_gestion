import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { config } from '../../../api/documental';
import styles from '../../../components/ui/Admin.module.css';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { useConsulta } from '../../../hooks/useConsulta';
import { useAuth } from '../../auth/hooks/useAuth';

export function OficinasActualesPage() {
  const { token } = useAuth().sesion!,
    consulta = useConsulta(useCallback(() => config.oficinas(token), [token]));
  return (
    <main className={styles.pagina}>
      <header className={styles.titulo}>
        <div>
          <h1>Oficinas</h1>
        </div>
        <Link className={styles.boton} to="/oficinas/nuevo">
          Crear oficina
        </Link>
      </header>
      <EstadoCarga {...consulta} reintentar={consulta.recargar} />
      {consulta.datos && (
        <section className={styles.tarjeta}>
          {consulta.datos.oficinas.length ? (
            <ul className={styles.listaOficinas}>
              {consulta.datos.oficinas.map((o) => (
                <li key={o.id}>
                  <div>
                    <Link to={'/oficinas/' + o.id}>{o.nombre}</Link>
                    <span className={`${styles.estado} ${o.activa ? '' : styles.inactivo}`}>
                      {o.activa ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                  <Link className={styles.secundario} to={'/oficinas/' + o.id}>
                    Ver detalle
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.vacio}>Aún no hay oficinas registradas.</p>
          )}
        </section>
      )}
    </main>
  );
}
