import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { etiquetas, type EstadisticasDashboard } from '../../../api/documental';
import admin from '../../../components/ui/Admin.module.css';
import styles from './GraficosDashboard.module.css';

type Conteo = { etiqueta: string; total: number };
type Grupo = Extract<
  EstadisticasDashboard,
  { grupos_documentales: unknown }
>['grupos_documentales'][number];
const numero = (n: number) => n.toLocaleString('es-PE');
const porcentaje = (n: number, total: number) =>
  total ? ((n / total) * 100).toLocaleString('es-PE', { maximumFractionDigits: 1 }) : '0';
const mes = (valor: string) =>
  new Intl.DateTimeFormat('es-PE', {
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(new Date(valor + '-15T12:00:00Z'));
const colores = [
  'var(--grafico-azul)',
  'var(--grafico-oro)',
  'var(--grafico-terracota)',
  'var(--grafico-verde)',
  'var(--grafico-neutro)',
];
const colorSituacion: Record<string, string> = {
  PERSONAL: 'var(--grafico-azul)',
  PENDIENTE_DIRECCION: 'var(--grafico-oro)',
  DELEGADO: 'var(--grafico-terracota)',
  EN_MI_OFICINA: 'var(--grafico-verde)',
  DELEGADO_POR_MI: 'var(--grafico-terracota)',
  DELEGADO_A_MI: 'var(--grafico-neutro)',
  GUARDADO_DIRECCION: 'var(--grafico-verde)',
  EN_MESA_DE_PARTES: 'var(--grafico-neutro)',
  ANULADO: 'var(--grafico-anulado)',
  Activas: 'var(--grafico-verde)',
  Inactivas: 'var(--grafico-neutro)',
};
const tooltipStyle = {
  background: 'var(--superficie-elevada,var(--superficie))',
  border: '1px solid var(--borde-control)',
  borderRadius: 10,
  color: 'var(--texto)',
  boxShadow: 'var(--sombra)',
};

/** Color asociado al nombre, independiente del orden y del subconjunto autorizado. */
export function colorCategoria(etiqueta: string, clase: 'tipo' | 'rol'): string {
  const roles: Record<string, string> = {
    Usuario: 'azul',
    'Secretaria de Dirección': 'oro',
    'Director(a)': 'verde',
    Administrador: 'terracota',
    Superadministrador: 'celeste',
  };
  if (clase === 'rol' && roles[etiqueta]) return `var(--grafico-${roles[etiqueta]})`;
  const paleta = ['azul', 'oro', 'terracota', 'verde', 'celeste'];
  let huella = 2166136261;
  for (const caracter of etiqueta.normalize('NFC'))
    huella = Math.imul(huella ^ caracter.codePointAt(0)!, 16777619) >>> 0;
  return `var(--grafico-${paleta[((huella ^ (huella >>> 16)) >>> 0) % paleta.length]})`;
}

function Panel({
  titulo,
  detalle,
  children,
  amplio = false,
}: {
  titulo: string;
  detalle: string;
  children: ReactNode;
  amplio?: boolean;
}) {
  const id = useId();
  return (
    <section className={`${styles.panel} ${amplio ? styles.amplio : ''}`} aria-labelledby={id}>
      <header>
        <h3 id={id}>{titulo}</h3>
        <p className={styles.ayuda}>{detalle}</p>
      </header>
      {children}
    </section>
  );
}

function Distribucion({
  datos,
  total,
  titulo,
  detalle,
  enlaces = false,
}: {
  datos: Conteo[];
  total: number;
  titulo: string;
  detalle: string;
  enlaces?: boolean;
}) {
  const entradas = datos.map((d, i) => ({
    ...d,
    nombre: etiquetas[d.etiqueta] ?? d.etiqueta,
    fill: colorSituacion[d.etiqueta] ?? colores[i % colores.length],
  }));
  return (
    <Panel titulo={titulo} detalle={detalle}>
      {total === 0 ? (
        <p className={styles.vacio}>Sin datos para esta distribución.</p>
      ) : (
        <div className={styles.distribucion}>
          <div className={styles.anillo}>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart accessibilityLayer aria-label={titulo}>
                <Pie
                  data={entradas}
                  dataKey="total"
                  nameKey="nombre"
                  innerRadius="66%"
                  outerRadius="88%"
                  paddingAngle={entradas.filter((d) => d.total > 0).length > 1 ? 3 : 0}
                  stroke="var(--superficie)"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: 'var(--texto)' }}
                  formatter={(valor) =>
                    `${numero(Number(valor))} · ${porcentaje(Number(valor), total)} %`
                  }
                />
              </PieChart>
            </ResponsiveContainer>
            <div className={styles.centro} aria-hidden="true">
              <strong>{numero(total)}</strong>
              <span>Total</span>
            </div>
          </div>
          <ul className={styles.leyenda} aria-label={titulo}>
            {entradas.map((d) => (
              <li key={d.etiqueta}>
                <i aria-hidden="true" style={{ background: d.fill }} />
                <div>
                  {enlaces ? (
                    <Link to={'/documentos?situacion=' + encodeURIComponent(d.etiqueta)}>
                      {d.nombre}
                    </Link>
                  ) : (
                    <span>{d.nombre}</span>
                  )}
                  <strong>
                    {numero(d.total)} <small>· {porcentaje(d.total, total)} %</small>
                  </strong>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function Barras({
  datos,
  total,
  titulo,
  detalle,
  clase = 'tipo',
}: {
  datos: Conteo[];
  total: number;
  titulo: string;
  detalle: string;
  clase?: 'tipo' | 'rol';
}) {
  return (
    <Panel
      titulo={titulo}
      detalle={
        datos.length === 1
          ? `${detalle} · ${clase === 'tipo' ? 'Un tipo documental' : 'Un rol'}`
          : detalle
      }
    >
      {!total ? (
        <p className={styles.vacio}>Sin datos para esta comparación.</p>
      ) : (
        <>
          <div className={styles.grafico} style={{ height: Math.max(220, datos.length * 46 + 55) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                aria-label={titulo}
                data={datos}
                layout="vertical"
                margin={{ left: 0, right: 30, top: 8, bottom: 4 }}
                accessibilityLayer
              >
                <CartesianGrid horizontal={false} stroke="var(--borde)" strokeDasharray="3 4" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fill: 'var(--texto-secundario)', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="etiqueta"
                  width={100}
                  tick={({ x, y, payload }) => (
                    <g transform={`translate(${x},${y})`} aria-label={String(payload.value)}>
                      <title>{String(payload.value)}</title>
                      <rect
                        x={-90}
                        y={-4}
                        width={8}
                        height={8}
                        rx={2}
                        fill={colorCategoria(String(payload.value), clase)}
                      />
                      <text
                        x={-76}
                        y={0}
                        dominantBaseline="central"
                        fill="var(--texto-secundario)"
                        fontSize={12}
                      >
                        {String(payload.value).length > 12
                          ? String(payload.value).slice(0, 11) + '…'
                          : String(payload.value)}
                      </text>
                    </g>
                  )}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'var(--superficie-secundaria)' }}
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: 'var(--texto)' }}
                  formatter={(valor) => [
                    `${numero(Number(valor))} · ${porcentaje(Number(valor), total)} %`,
                    'Cantidad',
                  ]}
                />
                <Bar
                  dataKey="total"
                  name="Cantidad"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={24}
                  isAnimationActive={false}
                  fill="var(--grafico-azul)"
                >
                  {datos.map((d) => (
                    <Cell key={d.etiqueta} fill={colorCategoria(d.etiqueta, clase)} />
                  ))}
                  <LabelList dataKey="total" position="right" fill="var(--texto)" fontSize={13} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className={styles.tablaDatos}>
            <summary>Ver cantidades y porcentajes</summary>
            <table>
              <caption>
                {titulo} · {numero(total)} en total
              </caption>
              <thead>
                <tr>
                  <th scope="col">Categoría</th>
                  <th scope="col">Cantidad</th>
                  <th scope="col">%</th>
                </tr>
              </thead>
              <tbody>
                {datos.map((d) => (
                  <tr key={d.etiqueta}>
                    <th scope="row">{d.etiqueta}</th>
                    <td>{numero(d.total)}</td>
                    <td>{porcentaje(d.total, total)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </Panel>
  );
}

function SerieMensual({ grupo }: { grupo: Grupo }) {
  const [completo, setCompleto] = useState(false),
    id = useId();
  const datos = grupo.meses,
    activos = datos.filter((m) => m.total > 0),
    registros = datos.reduce((n, m) => n + m.total, 0),
    sinRegistros = datos.length - activos.length;
  const inicio = datos.findIndex((m) => m.total > 0),
    fin = datos.findLastIndex((m) => m.total > 0);
  const visibles = (completo ? datos : datos.slice(inicio, fin + 1)).map((m) => ({
    ...m,
    nombre: mes(m.mes),
  }));
  const columnas = activos.length === 1,
    anulados = datos.some((m) => m.anulados > 0);
  const contenido = (
    <>
      <CartesianGrid vertical={false} stroke="var(--borde)" strokeDasharray="3 4" />
      <XAxis
        dataKey="nombre"
        tick={{ fill: 'var(--texto-secundario)', fontSize: 12 }}
        axisLine={false}
        tickLine={false}
        minTickGap={24}
      />
      <YAxis
        width={36}
        allowDecimals={false}
        tick={{ fill: 'var(--texto-secundario)', fontSize: 12 }}
        axisLine={false}
        tickLine={false}
      />
      <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'var(--texto)' }} />
      <Legend wrapperStyle={{ fontSize: 13, paddingTop: 16 }} />
    </>
  );
  return (
    <Panel
      amplio
      titulo="Registros por mes"
      detalle={
        datos.length
          ? `${mes(datos[0].mes)} – ${mes(datos[datos.length - 1].mes)} · ${numero(registros)} registros`
          : 'Sin periodo disponible'
      }
    >
      {registros === 0 ? (
        <div className={styles.vacio}>
          <strong>Sin registros en estos meses</strong>
          <p>La distribución de documentos conserva el historial anterior.</p>
        </div>
      ) : (
        <>
          <div className={styles.filaPeriodo}>
            <span>
              {columnas ? 'Actividad concentrada en un mes' : 'Evolución de los registros'}
            </span>
            <label htmlFor={id}>
              Periodo
              <select
                id={id}
                value={completo ? 'completo' : 'actividad'}
                onChange={(e) => setCompleto(e.target.value === 'completo')}
              >
                <option value="actividad">Tramo con actividad</option>
                <option value="completo">Todos los meses</option>
              </select>
            </label>
          </div>
          <div className={styles.graficoTemporal}>
            <ResponsiveContainer width="100%" height="100%">
              {columnas ? (
                <BarChart
                  aria-label="Registros por mes"
                  data={visibles}
                  accessibilityLayer
                  margin={{ top: 12, right: 16, left: 0, bottom: 0 }}
                >
                  {contenido}
                  <Bar
                    dataKey="vigentes"
                    name="Vigentes"
                    fill="var(--grafico-azul)"
                    maxBarSize={48}
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey="vigentes"
                      position="top"
                      offset={0}
                      fill="var(--texto)"
                      fontSize={12}
                    />
                  </Bar>
                  {anulados && (
                    <Bar
                      dataKey="anulados"
                      name="Anulados"
                      fill="var(--grafico-anulado)"
                      maxBarSize={48}
                      isAnimationActive={false}
                    >
                      <LabelList
                        dataKey="anulados"
                        position="top"
                        offset={0}
                        fill="var(--texto)"
                        fontSize={12}
                      />
                    </Bar>
                  )}
                </BarChart>
              ) : (
                <LineChart
                  aria-label="Registros por mes"
                  data={visibles}
                  accessibilityLayer
                  margin={{ top: 12, right: 16, left: 0, bottom: 0 }}
                >
                  {contenido}
                  <Line
                    type="linear"
                    dataKey="vigentes"
                    name="Vigentes"
                    stroke="var(--grafico-azul)"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                    isAnimationActive={false}
                  />
                  {anulados && (
                    <Line
                      type="linear"
                      dataKey="anulados"
                      name="Anulados"
                      stroke="var(--grafico-anulado)"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                  )}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </>
      )}
      {sinRegistros > 0 && (
        <p className={styles.nota}>
          {sinRegistros} {sinRegistros === 1 ? 'mes sin registros' : 'meses sin registros'} ·
          disponibles en la tabla{!completo && inicio >= 0 ? ' y en «Todos los meses»' : ''}.
        </p>
      )}
      <details className={styles.tablaDatos}>
        <summary>Ver tabla mensual completa</summary>
        <table>
          <caption>Documentos por fecha de registro · situación actual</caption>
          <thead>
            <tr>
              <th scope="col">Mes</th>
              <th scope="col">Vigentes</th>
              {anulados && <th scope="col">Anulados</th>}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {datos.map((m) => (
              <tr key={m.mes}>
                <th scope="row">
                  <time dateTime={m.mes}>{mes(m.mes)}</time>
                </th>
                <td>{numero(m.vigentes)}</td>
                {anulados && <td>{numero(m.anulados)}</td>}
                <td>{numero(m.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Panel>
  );
}

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
              <summary>
                Ámbitos personales · {numero(grupo.total)} documentos · solo lectura
              </summary>
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
