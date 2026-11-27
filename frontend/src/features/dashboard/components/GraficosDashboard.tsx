/** Archivo: Selecciona los gráficos correspondientes al alcance autorizado de la cuenta.
 */
import type { EstadisticasDashboard } from '../../../api/documental';
import { Link } from 'react-router-dom';
import { Distribucion, Barras, numero } from './GraficosDistribucion';
import admin from '../../../components/ui/Admin.module.css';
import { SerieMensual } from './SerieMensual';
import styles from './GraficosDashboard.module.css';
export { colorCategoria } from './GraficosDistribucion';

type Grupo = Extract<EstadisticasDashboard, { grupos_documentales: unknown }>['grupos_documentales'][number];

function Documental({ grupo }: { grupo: Grupo }) {
  const titulo =
    grupo.clave === 'compartido'
      ? 'Gestión de Dirección y Secretaría'
      : grupo.clave === 'global'
        ? 'Panorama institucional'
        : grupo.etiqueta;
  return (
    <section className={styles.grupo} aria-label={titulo}>
      <header className={styles.cabecera}>
        <h2>{titulo}</h2>
        <span>{numero(grupo.total)} documentos</span>
      </header>
      {!grupo.total ? (
        <div className={styles.vacio}>
          <h3>Sin documentos en este ámbito</h3>
          <p>Los gráficos aparecerán cuando existan registros.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          <Distribucion
            datos={grupo.situaciones}
            total={grupo.total}
            titulo="Situación de los documentos"
            detalle="Distribución actual · todo el historial"
            enlaces={['personal', 'global'].includes(grupo.clave)}
          />
          <Barras
            datos={grupo.tipos}
            total={grupo.vigentes}
            titulo="Tipos documentales"
            detalle={`${numero(grupo.vigentes)} documentos vigentes · todo el historial`}
          />
          <SerieMensual grupo={grupo} />
        </div>
      )}
    </section>
  );
}

/** Presenta agregados autorizados del servidor; las tablas comunican las mismas cifras que los gráficos. */
export function GraficosDashboard({
  estadisticas,
  rol,
}: {
  estadisticas: EstadisticasDashboard;
  rol: string;
}) {
  return (
    <section aria-label="Estadísticas del dashboard">
      {'grupos_documentales' in estadisticas &&
        rol !== 'Administrador' &&
        estadisticas.grupos_documentales.map((grupo) =>
          grupo.clave === 'personales_ajenos' ? (
            <details className={styles.grupoLectura} key={grupo.clave}>
              <summary>Ámbitos personales · {numero(grupo.total)} documentos · solo lectura</summary>
              <Documental grupo={grupo} />
            </details>
          ) : (
            <Documental key={grupo.clave} grupo={grupo} />
          ),
        )}
      {estadisticas.administracion && (
        <section className={styles.grupo} aria-label="Administración de cuentas y oficinas">
          <header className={styles.cabecera}>
            <h2>Cuentas y oficinas</h2>
            <Link to="/usuarios">Administrar cuentas →</Link>
          </header>
          <div className={styles.grid}>
            <Barras
              datos={estadisticas.administracion.cuentas_por_rol}
              total={estadisticas.administracion.cuentas_por_rol.reduce((n, r) => n + r.total, 0)}
              titulo="Cuentas por rol"
              clase="rol"
              detalle="Cuentas activas e inactivas"
            />
            <Distribucion
              datos={estadisticas.administracion.actividad_cuentas}
              total={estadisticas.administracion.actividad_cuentas.reduce((n, r) => n + r.total, 0)}
              titulo="Actividad de las cuentas"
              detalle="Disponibilidad de acceso al sistema"
            />
          </div>
          <div className={styles.oficinas}>
            <h3>Oficinas</h3>
            {estadisticas.administracion.actividad_oficinas.map((d) => (
              <p key={d.etiqueta}>
                <span>{d.etiqueta}</span>
                <strong>{numero(d.total)}</strong>
              </p>
            ))}
            <Link to="/oficinas" className={admin.secundario}>
              Ver oficinas
            </Link>
          </div>
        </section>
      )}
    </section>
  );
}
