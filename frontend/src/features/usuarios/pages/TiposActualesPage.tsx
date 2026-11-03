import { useCallback, useState } from 'react';
import { config } from '../../../api/documental';
import styles from '../../../components/ui/Admin.module.css';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { useConsulta } from '../../../hooks/useConsulta';
import { useAuth } from '../../auth/hooks/useAuth';
export { OficinasActualesPage } from './OficinasPages';
export function TiposActualesPage() {
  const { token } = useAuth().sesion!,
    [nombre, setNombre] = useState(''),
    [prefijo, setPrefijo] = useState(''),
    [error, setError] = useState(''),
    [mensaje, setMensaje] = useState(''),
    [ocupado, setOcupado] = useState(false);
  const consulta = useConsulta(useCallback(() => config.tipos(token), [token]));
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMensaje('');
    setOcupado(true);
    try {
      await config.guardar(token, 'tipos-documentales', {
        nombre: nombre.trim(),
        prefijo: prefijo.trim().toUpperCase(),
      });
      setNombre('');
      setPrefijo('');
      setMensaje('Tipo documental añadido.');
      consulta.recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo añadir');
    } finally {
      setOcupado(false);
    }
  }
  return (
    <main className={styles.pagina}>
      <h1>Tipos documentales</h1>
      <EstadoCarga {...consulta} reintentar={consulta.recargar} />
      {consulta.datos && (
        <section className={styles.tarjeta}>
          <ul>
            {consulta.datos.tipos.map((t) => (
              <li key={t.id}>
                {t.nombre} · {t.prefijo}
                {!t.activo ? ' (inactivo)' : ''}
              </li>
            ))}
          </ul>
          {!consulta.datos.tipos.length && <p>Aún no tienes tipos documentales.</p>}
        </section>
      )}
      <section className={styles.tarjeta}>
        <h2>Añadir tipo</h2>
        <form onSubmit={(e) => void guardar(e)}>
          <div className={styles.datos}>
            <label className={styles.campo}>
              Nombre
              <input
                required
                maxLength={250}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </label>
            <label className={styles.campo}>
              Prefijo (2–8 letras)
              <input
                required
                pattern="[A-Z]{2,8}"
                minLength={2}
                maxLength={8}
                value={prefijo}
                onChange={(e) => setPrefijo(e.target.value.toUpperCase())}
              />
            </label>
          </div>
          <button className={styles.boton} disabled={ocupado}>
            Añadir tipo
          </button>
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
    </main>
  );
}
