import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { config } from '../../../api/documental';
import styles from '../../../components/ui/Admin.module.css';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { useConsulta } from '../../../hooks/useConsulta';
import { useAuth } from '../../auth/hooks/useAuth';
type Oficina = { id: string; nombre: string; activa: boolean };
const institucional = (nombre: string) => ['Dirección', 'Mesa de Partes'].includes(nombre);
export function OficinaFormularioPage() {
  const { id } = useParams(),
    { token } = useAuth().sesion!;
  const consulta = useConsulta(
    useCallback(async () => (id ? (await config.oficina(token, id)).oficina : null), [token, id]),
  );
  return (
    <main className={styles.pagina}>
      <h1>{id ? 'Editar nombre de oficina' : 'Crear oficina'}</h1>
      <EstadoCarga {...consulta} reintentar={consulta.recargar} />
      {!consulta.cargando && !consulta.error && (
        <Formulario key={id ?? 'nueva'} token={token} inicial={consulta.datos} />
      )}
    </main>
  );
}
/** Solo edita el nombre: activar o desactivar una oficina es una acción separada y auditada. */
function Formulario({ token, inicial }: { token: string; inicial: Oficina | null }) {
  const navegar = useNavigate(),
    [nombre, setNombre] = useState(inicial?.nombre ?? ''),
    [motivo, setMotivo] = useState(''),
    [error, setError] = useState(''),
    [ocupado, setOcupado] = useState(false),
    enviando = useRef(false),
    protegida = !!inicial && institucional(inicial.nombre);
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando.current || protegida) return;
    enviando.current = true;
    setOcupado(true);
    setError('');
    try {
      const r = await config.guardar(
        token,
        'oficinas' + (inicial ? '/' + inicial.id : ''),
        inicial ? { nombre: nombre.trim(), motivo: motivo.trim() } : { nombre: nombre.trim() },
        inicial ? 'PUT' : 'POST',
      );
      navegar('/oficinas/' + (inicial?.id ?? ('id' in r ? r.id : '')), { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      enviando.current = false;
      setOcupado(false);
    }
  }
  return (
    <section className={styles.tarjeta}>
      {protegida && <p className={styles.aviso}>Esta oficina conserva su nombre institucional.</p>}
      <form onSubmit={(e) => void guardar(e)}>
        <fieldset className={styles.grupoDestino} disabled={ocupado || protegida}>
          <div className={styles.formularioDosColumnas}>
            <label className={styles.campo}>
              Nombre de la oficina
              <input
                required
                maxLength={250}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </label>
            {inicial && (
              <label className={styles.campo}>
                Motivo del cambio
                <textarea
                  required
                  maxLength={1000}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </label>
            )}
          </div>
          <button className={styles.boton} disabled={ocupado || protegida}>
            {ocupado ? 'Guardando…' : inicial ? 'Guardar nombre' : 'Crear oficina'}
          </button>
        </fieldset>
        <div className={styles.acciones}>
          <Link
            className={styles.secundario}
            to={inicial ? '/oficinas/' + inicial.id : '/oficinas'}
          >
            Cancelar
          </Link>
        </div>
      </form>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
