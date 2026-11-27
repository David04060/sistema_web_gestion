/** Archivo: Gestiona tipos propios y muestra los compartidos; exige motivo al editar o eliminar.
 */
import { useCallback, useState } from 'react';
import { config } from '../../../api/documental';
import styles from '../../../components/ui/Admin.module.css';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { useConsulta } from '../../../hooks/useConsulta';
import { useAuth } from '../../auth/hooks/useAuth';
import { TipoDocumentalForm, type TipoEditable } from '../components/TipoDocumentalForm';

/** El servidor determina qué tipos pertenecen al creador; el ámbito compartido solo permite consultarlos. */
export function TiposActualesPage() {
  const { token } = useAuth().sesion!;
  const [editando, setEditando] = useState<TipoEditable>();
  const [retirando, setRetirando] = useState<TipoEditable>();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [versionFormulario, setVersionFormulario] = useState(0);
  const consulta = useConsulta(useCallback(() => config.tipos(token), [token]));

  async function guardar(datos: { nombre: string; prefijo: string; activo: boolean; motivo: string }) {
    setError('');
    setMensaje('');
    setOcupado(true);
    try {
      await config.guardar(
        token,
        'tipos-documentales' + (editando ? '/' + editando.id : ''),
        editando ? datos : { nombre: datos.nombre, prefijo: datos.prefijo },
        editando ? 'PUT' : 'POST',
      );
      setMensaje(editando ? 'Tipo documental actualizado.' : 'Tipo documental añadido.');
      setEditando(undefined);
      setVersionFormulario((v) => v + 1);
      consulta.recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el tipo');
    } finally {
      setOcupado(false);
    }
  }

  /** La confirmación identifica el tipo y exige motivo; el API vuelve a comprobar que no tenga documentos. */
  async function eliminar(e: React.FormEvent) {
    e.preventDefault();
    if (!retirando) return;
    setError('');
    setMensaje('');
    setOcupado(true);
    try {
      await config.guardar(token, 'tipos-documentales/' + retirando.id, { motivo: motivo.trim() }, 'DELETE');
      setRetirando(undefined);
      setMotivo('');
      setMensaje('Tipo documental eliminado.');
      consulta.recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el tipo');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main className={styles.pagina}>
      <h1>Tipos documentales</h1>
      <p>Puedes editar los tipos que has creado. Los tipos compartidos de otra cuenta son de consulta.</p>
      <EstadoCarga {...consulta} reintentar={consulta.recargar} />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {mensaje && (
        <p className={styles.exito} role="status">
          {mensaje}
        </p>
      )}
      {consulta.datos && (
        <section className={styles.tarjeta} aria-label="Catálogo de tipos documentales">
          <ul className={styles.listaTipos}>
            {consulta.datos.tipos.map((t) => (
              <li key={t.id}>
                <div>
                  <strong>{t.nombre}</strong> · {t.prefijo}
                  {!t.activo && ' (inactivo)'}
                  <p>
                    {t.editable ? 'Creado por tu cuenta' : 'Compartido por otra cuenta'}
                    {t.en_uso && ' · Con documentos registrados'}
                  </p>
                </div>
                {t.editable && (
                  <div className={styles.acciones}>
                    <button
                      disabled={ocupado}
                      onClick={() => {
                        setEditando(t);
                        setRetirando(undefined);
                        setError('');
                      }}
                    >
                      Editar {t.nombre}
                    </button>
                    {!t.en_uso && (
                      <button
                        disabled={ocupado}
                        onClick={() => {
                          setRetirando(t);
                          setEditando(undefined);
                          setMotivo('');
                          setError('');
                        }}
                      >
                        Eliminar {t.nombre}
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!consulta.datos.tipos.length && <p>Aún no tienes tipos documentales.</p>}
        </section>
      )}
      {retirando ? (
        <section className={styles.tarjeta} aria-label="Confirmar eliminación">
          <h2>Eliminar {retirando.nombre}</h2>
          <p>Se eliminará este tipo sin documentos asociados. Esta acción no se puede deshacer.</p>
          <form onSubmit={(e) => void eliminar(e)}>
            <label className={styles.campo}>
              Motivo de eliminación
              <input
                required
                maxLength={1000}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                disabled={ocupado}
              />
            </label>
            <div className={styles.acciones}>
              <button className={styles.boton} disabled={ocupado}>
                {ocupado ? 'Eliminando…' : 'Confirmar eliminación'}
              </button>
              <button type="button" disabled={ocupado} onClick={() => setRetirando(undefined)}>
                Cancelar
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className={styles.tarjeta}>
          <h2>{editando ? 'Editar tipo' : 'Añadir tipo'}</h2>
          <TipoDocumentalForm
            key={(editando?.id ?? 'nuevo') + ':' + versionFormulario}
            inicial={editando}
            ocupado={ocupado}
            guardar={(datos) => void guardar(datos)}
            cancelar={() => setEditando(undefined)}
          />
        </section>
      )}
    </main>
  );
}
