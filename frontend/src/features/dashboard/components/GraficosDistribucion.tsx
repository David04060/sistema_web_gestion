/** Archivo: Presenta distribuciones y barras con etiquetas, colores estables y tablas accesibles.
 */
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { etiquetas } from '../../../api/documental';
import styles from './GraficosDashboard.module.css';

type Conteo = { etiqueta: string; total: number };
export const numero = (n: number) => n.toLocaleString('es-PE');
const porcentaje = (n: number, total: number) =>
  total ? ((n / total) * 100).toLocaleString('es-PE', { maximumFractionDigits: 1 }) : '0';
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
export const tooltipStyle = {
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

/** Agrupa título, ayuda y contenido bajo un identificador accesible único. */
export function Panel({
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

/** Recibe categorías y total autorizados; presenta proporciones y la lista equivalente, incluso sin datos. */
export function Distribucion({
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
                  formatter={(valor) => `${numero(Number(valor))} · ${porcentaje(Number(valor), total)} %`}
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
                    <Link to={'/documentos?situacion=' + encodeURIComponent(d.etiqueta)}>{d.nombre}</Link>
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

/** Compara categorías con colores estables y ofrece la tabla completa cuando el gráfico limita etiquetas. */
export function Barras({
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
        datos.length === 1 ? `${detalle} · ${clase === 'tipo' ? 'Un tipo documental' : 'Un rol'}` : detalle
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
