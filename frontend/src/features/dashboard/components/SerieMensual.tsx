/** Archivo: Muestra registros y decisiones por mes, con selector de serie y tabla de los mismos datos.
 */
import { useId, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { EstadisticasDashboard } from '../../../api/documental';
import { numero, tooltipStyle, Panel } from './GraficosDistribucion';
import styles from './GraficosDashboard.module.css';

type Grupo = Extract<EstadisticasDashboard, { grupos_documentales: unknown }>['grupos_documentales'][number];
const mes = (valor: string) =>
  new Intl.DateTimeFormat('es-PE', {
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(new Date(valor + '-15T12:00:00Z'));

/** Recibe meses autorizados; alterna el periodo visible y conserva todos los meses en la tabla. */
export function SerieMensual({ grupo }: { grupo: Grupo }) {
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
  // Un solo mes se representa con barras: una línea sugeriría una evolución inexistente.
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
            <span>{columnas ? 'Actividad concentrada en un mes' : 'Evolución de los registros'}</span>
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
          {sinRegistros} {sinRegistros === 1 ? 'mes sin registros' : 'meses sin registros'} · disponibles en
          la tabla{!completo && inicio >= 0 ? ' y en «Todos los meses»' : ''}.
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
