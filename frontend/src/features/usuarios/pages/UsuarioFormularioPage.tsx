import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { config, type Cuenta } from '../../../api/documental';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import styles from '../../../components/ui/Admin.module.css';
export function UsuarioFormularioPage() {
  const { id } = useParams(),
    { token, usuario: actor } = useAuth().sesion!;
  const consulta = useConsulta(
    useCallback(
      async () => ({
        cuenta: id ? (await config.usuario(token, id)).usuario : null,
        roles: (await config.roles(token)).roles,
        oficinas: (await config.oficinas(token)).oficinas,
      }),
      [token, id],
    ),
  );
  return (
    <main className={styles.pagina}>
      <h1>{id ? 'Editar cuenta' : 'Crear cuenta'}</h1>
      <EstadoCarga {...consulta} tipo="detalle" reintentar={consulta.recargar} />
      {consulta.datos &&
        (consulta.datos.cuenta?.rol_id === 1 && actor.rol !== 'Superadministrador' ? (
          <p role="alert">Esta cuenta solo puede administrarla Superadministración.</p>
        ) : (
          <Formulario
            key={id ?? 'nuevo'}
            token={token}
            id={id}
            inicial={consulta.datos.cuenta}
            roles={consulta.datos.roles.filter(
              (r) => r.id !== 1 || consulta.datos?.cuenta?.rol_id === 1,
            )}
            oficinas={consulta.datos.oficinas}
          />
        ))}
    </main>
  );
}
export function Formulario({
  token,
  id,
  inicial,
  roles,
  oficinas,
}: {
  token: string;
  id?: string;
  inicial: Cuenta | null;
  roles: Array<{
    id: number;
    nombre: string;
  }>;
  oficinas: Array<{
    id: string;
    nombre: string;
    activa: boolean;
  }>;
}) {
  const navegar = useNavigate(),
    [v, setV] = useState({
      nombre: inicial?.nombre ?? '',
      apellido: inicial?.apellido ?? '',
      nombre_usuario: inicial?.nombre_usuario ?? '',
      email: inicial?.email ?? '',
      telefono: inicial?.telefono ?? '',
      rol: String(inicial?.rol_id ?? 5),
      oficina: inicial?.oficina_id ?? '',
      contrasena: '',
      motivo: '',
    }),
    [error, setError] = useState(''),
    [ocupado, setOcupado] = useState(false);
  const cambio = (k: keyof typeof v, valor: string | boolean) =>
    setV((v) => ({ ...v, [k]: valor }));
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setError('');
    try {
      const base = {
        nombre: v.nombre.trim(),
        apellido: v.apellido.trim(),
        nombre_usuario: v.nombre_usuario.trim().toLowerCase(),
        email: v.email.trim() || null,
        telefono: v.telefono.trim() || null,
        rol_id: Number(v.rol),
        oficina_id: ['1', '2'].includes(v.rol) ? null : v.oficina || null,
      };
      const r = await config.guardar(
        token,
        'usuarios' + (id ? '/' + id : ''),
        id ? { ...base, motivo: v.motivo.trim() } : { ...base, contrasena: v.contrasena },
        id ? 'PUT' : 'POST',
      );
      navegar('/usuarios/' + (id ?? ('id' in r ? r.id : '')), { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setOcupado(false);
    }
  }
  const opciones = oficinas.filter((o) =>
    v.rol === '3'
      ? o.nombre === 'Dirección'
      : v.rol === '4'
        ? o.nombre === 'Mesa de Partes'
        : !['Dirección', 'Mesa de Partes'].includes(o.nombre) && (o.activa || o.id === v.oficina),
  );
  return (
    <section className={styles.tarjeta}>
      <form onSubmit={(e) => void guardar(e)}>
        <div className={styles.formularioDosColumnas}>
          <label className={styles.campo}>
            Nombre
            <input
              required
              maxLength={150}
              value={v.nombre}
              onChange={(e) => cambio('nombre', e.target.value)}
            />
          </label>
          <label className={styles.campo}>
            Apellido
            <input
              required
              maxLength={150}
              value={v.apellido}
              onChange={(e) => cambio('apellido', e.target.value)}
            />
          </label>
          <label className={styles.campo}>
            Nombre de usuario
            <input
              required
              minLength={3}
              maxLength={80}
              pattern="[a-z0-9._-]{3,80}"
              value={v.nombre_usuario}
              onChange={(e) => cambio('nombre_usuario', e.target.value.toLowerCase())}
            />
          </label>
          <label className={styles.campo}>
            Correo opcional
            <input type="email" value={v.email} onChange={(e) => cambio('email', e.target.value)} />
          </label>
          <label className={styles.campo}>
            Teléfono opcional
            <input
              maxLength={50}
              value={v.telefono}
              onChange={(e) => cambio('telefono', e.target.value)}
            />
          </label>
          <label className={styles.campo}>
            Rol
            <select
              disabled={inicial?.rol_id === 1}
              value={v.rol}
              onChange={(e) => {
                cambio('rol', e.target.value);
                cambio('oficina', '');
              }}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </label>
          {!['1', '2'].includes(v.rol) && (
            <label className={styles.campo}>
              Oficina opcional
              <select
                value={v.oficina}
                onChange={(e) => cambio('oficina', e.target.value)}
              >
                <option value="">Sin asignar</option>
                {opciones.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          {id ? (
            <>
              <label className={styles.campo}>
                Motivo de modificación
                <textarea
                  required
                  maxLength={1000}
                  value={v.motivo}
                  onChange={(e) => cambio('motivo', e.target.value)}
                />
              </label>
            </>
          ) : (
            <label className={styles.campo}>
              Contraseña (8–128 caracteres)
              <input
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                value={v.contrasena}
                onChange={(e) => cambio('contrasena', e.target.value)}
              />
            </label>
          )}
        </div>
        {id && <p>Guardar cerrará las sesiones de esta cuenta.</p>}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.acciones}>
          <button className={styles.boton} disabled={ocupado}>
            {ocupado ? 'Guardando…' : 'Guardar cuenta'}
          </button>
          <Link className={styles.secundario} to={id ? '/usuarios/' + id : '/usuarios'}>
            Cancelar
          </Link>
        </div>
      </form>
    </section>
  );
}
