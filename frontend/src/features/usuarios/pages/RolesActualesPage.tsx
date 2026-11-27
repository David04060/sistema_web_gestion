/** Archivo: Permite cambiar el nombre visible de un rol sin modificar sus permisos.
 */
import { useCallback, useState } from 'react';
import { config } from '../../../api/documental';
import styles from '../../../components/ui/Admin.module.css';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { useConsulta } from '../../../hooks/useConsulta';
import { useAuth } from '../../auth/hooks/useAuth';

export function RolesActualesPage() {
  const { token } = useAuth().sesion!;
  const consulta = useConsulta(useCallback(() => config.roles(token), [token]));
  const [edicion, setEdicion] = useState<{ id: number; nombre: string }>();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!edicion || ocupado) return;
    setOcupado(true);
    setError('');
    try {
      await config.guardar(token, 'roles/' + edicion.id, { nombre: edicion.nombre.trim() }, 'PUT');
      setEdicion(undefined);
      consulta.recargar();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo guardar el nombre');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main className={styles.pagina}>
      <h1>Roles del sistema</h1>
      <EstadoCarga {...consulta} reintentar={consulta.recargar} />
      {consulta.datos && (
        <section className={styles.tarjeta}>
          <ul>
            {consulta.datos.roles.map((r) => (
              <li key={r.id}>
                {edicion?.id === r.id ? (
                  <form onSubmit={guardar}>
                    <label className={styles.campo}>
                      Nombre visible
                      <input
                        required
                        maxLength={250}
                        value={edicion.nombre}
                        disabled={ocupado}
                        onChange={(e) => setEdicion({ id: r.id, nombre: e.target.value })}
                      />
                    </label>
                    {error && <p role="alert">{error}</p>}
                    <div className={styles.acciones}>
                      <button className={styles.boton} disabled={ocupado || !edicion.nombre.trim()}>
                        Guardar nombre
                      </button>
                      <button
                        className={styles.secundario}
                        type="button"
                        disabled={ocupado}
                        onClick={() => setEdicion(undefined)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className={styles.acciones}>
                    <span>{r.nombre}</span>
                    <button
                      className={styles.secundario}
                      type="button"
                      disabled={ocupado}
                      aria-label={'Editar nombre de ' + r.nombre}
                      onClick={() => {
                        setError('');
                        setEdicion({ id: r.id, nombre: r.nombre });
                      }}
                    >
                      Editar nombre
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p>Asigna el rol desde el detalle de cada cuenta.</p>
        </section>
      )}
    </main>
  );
}
