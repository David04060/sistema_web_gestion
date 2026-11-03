import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, etiquetas } from '../../../api/documental';
import { rolesRegistro, esAdministracion } from '../../../lib/perfiles';
import { useAuth } from '../../auth/hooks/useAuth';
import type { Usuario } from '../../auth/schemas/auth.schema';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { TextoExpandible } from '../../../components/ui/TextoExpandible';
import { GraficosDashboard } from '../components/GraficosDashboard';
import { fechaLocal } from '../../../lib/fechas';
import styles from '../../../components/ui/Admin.module.css';
import panel from '../styles/Resumen.module.css';

const acentos: Record<string, string> = {
  ANULADO: 'var(--error)',
  DELEGADO: 'var(--indicador-terracota)',
  GUARDADO_DIRECCION: 'var(--indicador-verde)',
  PENDIENTE_DIRECCION: 'var(--indicador-oro)',
  PERSONAL: 'var(--indicador-azul)',
  EN_MESA_DE_PARTES: 'var(--indicador-neutro)',
};

export function DashboardPage(_props: { usuario?: Usuario } = {}) {
  const { token, usuario } = useAuth().sesion!;
  const consulta = useConsulta(useCallback(() => api.dashboard(token), [token]));
  const datos = consulta.datos,
    admin = esAdministracion(usuario.rol);
  const estados = datos
    ? 'estados' in datos
      ? datos.estados
      : 'documentos' in datos
        ? (datos.documentos ?? [])
        : []
    : [];
  return (
    <main className={styles.pagina}>
      <header className={styles.titulo}>
        <div>
          <h1>
            {usuario.rol === 'Administrador'
              ? 'Administración'
              : usuario.rol === 'Director(a)'
                ? 'Panel de Dirección'
                : usuario.rol === 'Secretaria de Dirección'
                  ? 'Panel de Secretaría'
                  : usuario.rol === 'Superadministrador'
                    ? 'Vista general'
                    : 'Mi actividad documental'}
          </h1>
          <p>Hola, {usuario.nombre}.</p>
        </div>
        <div className={styles.acciones}>
          <button
            className={styles.secundario}
            disabled={consulta.cargando || consulta.actualizando}
            onClick={consulta.recargar}
          >
            {consulta.actualizando ? 'Actualizando…' : 'Actualizar panel'}
          </button>
          {rolesRegistro.includes(usuario.rol) && (
            <Link className={styles.boton} to="/documentos/nuevo">
              Registrar documento
            </Link>
          )}
        </div>
      </header>
      <EstadoCarga {...consulta} tipo="dashboard" reintentar={consulta.recargar} />
      {consulta.actualizando && (
        <p role="status" className={styles.carga}>
          Actualizando cifras…
        </p>
      )}
      {datos && (
        <>
          {'usuarios' in datos && (
            <section className={styles.indicadores} aria-label="Resumen administrativo">
              <article className={styles.indicador}>
                <span>Cuentas visibles</span>
                <strong>{datos.usuarios}</strong>
                <Link to="/usuarios">Administrar usuarios</Link>
              </article>
              <article className={styles.indicador}>
                <span>Oficinas registradas</span>
                <strong>{datos.oficinas}</strong>
                <Link to="/oficinas">Administrar oficinas</Link>
              </article>
            </section>
          )}
          {datos.alcance === 'institucional' && (
            <h2 className={panel.titulo}>Documentos consultables</h2>
          )}
          {('estados' in datos || 'documentos' in datos) && (
            <section aria-label="Resumen documental">
              {estados.length ? (
                <div className={panel.resumen}>
                  {estados.map((s) => (
                    <Link
                      className={styles.indicador}
                      style={{ borderTopColor: acentos[s.situacion] }}
                      key={s.situacion}
                      to={'/documentos?situacion=' + s.situacion}
                    >
                      <span>{etiquetas[s.situacion]}</span>
                      <strong>{s.total}</strong>
                      <span>Ver documentos →</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className={styles.vacio}>Todavía no hay documentos visibles.</p>
              )}
            </section>
          )}
          {datos.estadisticas && (
            <GraficosDashboard estadisticas={datos.estadisticas} rol={usuario.rol} />
          )}
          <section className={styles.tarjeta}>
            <h2>Accesos rápidos</h2>
            <div className={styles.acciones}>
              {usuario.rol !== 'Administrador' && (
                <Link className={styles.secundario} to="/documentos">
                  Consultar documentos
                </Link>
              )}
              {usuario.rol === 'Superadministrador' && (
                <Link className={styles.secundario} to="/documentos?situacion=ANULADO">
                  Consultar anulados
                </Link>
              )}
              {admin && (
                <>
                  <Link className={styles.secundario} to="/usuarios">
                    Usuarios y asignaciones
                  </Link>
                  <Link className={styles.secundario} to="/oficinas">
                    Editar oficinas
                  </Link>
                  <Link className={styles.secundario} to="/campos-opcionales">
                    Campos opcionales
                  </Link>
                </>
              )}
              {rolesRegistro.includes(usuario.rol) && (
                <Link className={styles.secundario} to="/tipos-documentales">
                  Mis tipos documentales
                </Link>
              )}
              {(admin || usuario.oficina_id) && (
                <Link className={styles.secundario} to="/ubicaciones">
                  {admin ? 'Ubicaciones por cuenta' : 'Mis ubicaciones'}
                </Link>
              )}
            </div>
          </section>
          {'recientes' in datos && (
            <section className={styles.tarjeta}>
              <h2>Documentos recientes</h2>
              {datos.recientes.length ? (
                <ul className={styles.recientes}>
                  {datos.recientes.map((d) => (
                    <li key={d.id}>
                      <div>
                        <Link to={'/documentos/' + d.id}>{d.codigo_visible}</Link>
                        <TextoExpandible texto={d.asunto} />
                      </div>
                      <span>
                        {etiquetas[d.situacion]} · {fechaLocal(d.creado_en)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.vacio}>Aún no hay registros recientes.</p>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
