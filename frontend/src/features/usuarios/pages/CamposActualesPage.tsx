import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { config } from '../../../api/documental';
import styles from '../../../components/ui/Admin.module.css';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { useConsulta } from '../../../hooks/useConsulta';
import { useAuth } from '../../auth/hooks/useAuth';
export function CamposActualesPage() {
  const { token } = useAuth().sesion!,
    [params, setParams] = useSearchParams(),
    usuario = params.get('usuario') ?? '';
  const cuentas = useConsulta(useCallback(() => config.usuarios(token), [token]));
  return (
    <main className={styles.pagina}>
      <h1>Campos opcionales por cuenta</h1>
      <EstadoCarga {...cuentas} reintentar={cuentas.recargar} />
      <label className={styles.campo}>
        Cuenta
        <select
          value={usuario}
          onChange={(e) => setParams(e.target.value ? { usuario: e.target.value } : {})}
        >
          <option value="">Seleccionar cuenta documental</option>
          {cuentas.datos?.usuarios
            .filter((u) => [3, 4, 5].includes(u.rol_id))
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre} {u.apellido} ({u.nombre_usuario}) · {u.rol}
              </option>
            ))}
        </select>
      </label>
      {usuario &&
        cuentas.datos?.usuarios.some((u) => u.id === usuario && [3, 4, 5].includes(u.rol_id)) && (
          <CamposCuenta key={usuario} token={token} usuario={usuario} />
        )}
    </main>
  );
}
/** La selección de cuenta delimita el catálogo; renombrar no reescribe etiquetas de documentos anteriores. */
function CamposCuenta({ token, usuario }: { token: string; usuario: string }) {
  const consulta = useConsulta(useCallback(() => config.campos(token, usuario), [token, usuario]));
  const [edicion, setEdicion] = useState<string>(),
    [nombre, setNombre] = useState(''),
    [motivo, setMotivo] = useState(''),
    [error, setError] = useState(''),
    [mensaje, setMensaje] = useState(''),
    [ocupado, setOcupado] = useState(false);
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMensaje('');
    setOcupado(true);
    try {
      await config.guardar(
        token,
        'campos-opcionales' + (edicion ? '/' + edicion : ''),
        edicion
          ? { nombre: nombre.trim(), motivo: motivo.trim() }
          : { usuario_id: usuario, nombre: nombre.trim() },
        edicion ? 'PUT' : 'POST',
      );
      setNombre('');
      setEdicion(undefined);
      setMotivo('');
      setMensaje('Configuración guardada.');
      consulta.recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setOcupado(false);
    }
  }
  return (
    <>
      <EstadoCarga {...consulta} reintentar={consulta.recargar} />
      <section className={styles.tarjeta}>
        <p>
          Los cambios de nombre se aplican a registros nuevos. Los documentos anteriores conservan
          su etiqueta.
        </p>
        <ul>
          {consulta.datos?.campos.map((c) => (
            <li key={c.id}>
              {c.nombre_actual}{' '}
              <button
                type="button"
                disabled={ocupado}
                onClick={() => {
                  setEdicion(c.id);
                  setNombre(c.nombre_actual);
                  setMotivo('');
                }}
              >
                Renombrar
              </button>
            </li>
          ))}
        </ul>
        <h2>{edicion ? 'Renombrar campo' : 'Añadir campo'}</h2>
        <form onSubmit={(e) => void guardar(e)}>
          <label className={styles.campo}>
            Nombre
            <input
              required
              maxLength={250}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </label>
          {edicion && (
            <label className={styles.campo}>
              Motivo
              <textarea
                required
                maxLength={1000}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </label>
          )}
          <div className={styles.acciones}>
            <button className={styles.boton} disabled={ocupado}>
              Guardar
            </button>
            {edicion && (
              <button
                type="button"
                onClick={() => {
                  setEdicion(undefined);
                  setNombre('');
                  setMotivo('');
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
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
      </section>
    </>
  );
}
