import type { PoolClient } from 'pg';
import { pool } from '../../config/database.js';
import { actorActual, lecturaSQL, situacionCuentaSQL, type Actor } from '../../shared/documental/nucleo.js';
import { HttpError } from '../../shared/http/HttpError.js';

type Conexion = Pick<PoolClient, 'query'>;
interface Conteo {
  etiqueta: string;
  total: number;
}
interface Mes {
  mes: string;
  total: number;
  vigentes: number;
  anulados: number;
}
interface Periodo {
  desde: string;
  hasta: string;
  mes_actual_parcial: boolean;
}
interface Grupo {
  clave: string;
  etiqueta: string;
  total: number;
  vigentes: number;
  anulados: number;
  situaciones: Conteo[];
  tipos: Conteo[];
  meses: Mes[];
}
interface Contexto {
  zona_horaria: string;
  actualizado: string;
  periodo: Periodo;
}

/** Fija doce meses de Lima y un único instante de referencia para todas las agrupaciones. */
async function contexto(cliente: Conexion, referencia?: Date): Promise<Contexto> {
  const {
    rows: [r],
  } = await cliente.query<{ desde: Date; hasta: Date }>(
    `SELECT
  (date_trunc('month', t AT TIME ZONE 'America/Lima') - interval '11 months') AT TIME ZONE
  'America/Lima' desde, t hasta
  FROM (SELECT COALESCE($1::timestamptz,transaction_timestamp()) t) reloj`,
    [referencia ?? null],
  );
  return {
    zona_horaria: 'America/Lima',
    actualizado: r.hasta.toISOString(),
    periodo: {
      desde: r.desde.toISOString(),
      hasta: r.hasta.toISOString(),
      mes_actual_parcial: true,
    },
  };
}

/** Agrega cuentas y oficinas sin consultar contenido documental; excluye al Superadministrador cuando corresponde. */
async function administracion(cliente: Conexion, identidad: Actor) {
  const valores = [identidad.rol_id];
  const cuentas_por_rol = (
    await cliente.query<Conteo>(
      `SELECT r.codigo etiqueta,count(u.id)::int total
  FROM roles r LEFT JOIN usuarios u ON u.rol_id=r.id
  WHERE ($1::smallint=1 OR r.id<>1) GROUP BY r.id,r.codigo ORDER BY r.id`,
      valores,
    )
  ).rows;
  const {
    rows: [cuentas],
  } = await cliente.query<{ activas: number; inactivas: number }>(
    `SELECT count(*) FILTER(WHERE activo)::int activas,
  count(*) FILTER(WHERE NOT activo)::int inactivas FROM usuarios WHERE ($1::smallint=1 OR rol_id<>1)`,
    valores,
  );
  const {
    rows: [oficinas],
  } = await cliente.query<{ activas: number; inactivas: number }>(
    'SELECT count(*) FILTER(WHERE activa)::int activas,count(*) FILTER(WHERE NOT activa)::int inactivas FROM oficinas',
  );
  const nombres: Record<string, string> = {
    SUPERADMINISTRADOR: 'Superadministrador',
    ADMINISTRADOR: 'Administrador',
    DIRECTOR: 'Director(a)',
    SECRETARIA_DIRECCION: 'Secretaria de Dirección',
    USUARIO: 'Usuario',
  };
  return {
    cuentas_por_rol: cuentas_por_rol.map((r) => ({
      ...r,
      etiqueta: nombres[r.etiqueta] ?? r.etiqueta,
    })),
    actividad_cuentas: [
      { etiqueta: 'Activas', total: cuentas.activas },
      { etiqueta: 'Inactivas', total: cuentas.inactivas },
    ],
    actividad_oficinas: [
      { etiqueta: 'Activas', total: oficinas.activas },
      { etiqueta: 'Inactivas', total: oficinas.inactivas },
    ],
  };
}

/** El filtro procede de constantes internas; lecturaSQL sigue delimitando cada contador, tipo y serie mensual. */
async function grupoDocumental(
  cliente: Conexion,
  identidad: Actor,
  contexto: Contexto,
  clave: string,
  etiqueta: string,
  filtro: string,
): Promise<Grupo> {
  const valores = [identidad.id, identidad.rol_id, identidad.ambito_id];
  const condicion = `${lecturaSQL} AND (${filtro})`;
  const {
    rows: [resumen],
  } = await cliente.query<{ total: number; vigentes: number; anulados: number }>(
    `SELECT count(*)::int total,
  count(*) FILTER(WHERE d.situacion<>'ANULADO')::int vigentes,
  count(*) FILTER(WHERE d.situacion='ANULADO')::int anulados
  FROM documentos d WHERE ${condicion}`,
    valores,
  );
  const situaciones = (
    await cliente.query<Conteo>(
      `SELECT ${clave === 'global' ? 'd.situacion' : situacionCuentaSQL} etiqueta,count(*)::int total FROM documentos d WHERE ${condicion} GROUP BY 1
  ORDER BY 1`,
      valores,
    )
  ).rows;
  const tipos = (
    await cliente.query<Conteo>(
      `SELECT d.tipo_nombre_guardado etiqueta,count(*)::int total FROM documentos d
  WHERE ${condicion} AND d.situacion<>'ANULADO' GROUP BY d.tipo_nombre_guardado ORDER BY total DESC,
  d.tipo_nombre_guardado`,
      valores,
    )
  ).rows;
  const meses = (
    await cliente.query<Mes>(
      `WITH meses AS (
  SELECT generate_series($4::timestamptz AT TIME ZONE 'America/Lima',
  date_trunc('month',$5::timestamptz AT TIME ZONE 'America/Lima'),
  interval '1 month') mes
 ), visibles AS (SELECT d.id,d.situacion,date_trunc('month',d.creado_en AT TIME ZONE 'America/Lima')
  mes
  FROM documentos d WHERE ${condicion} AND d.creado_en >= $4::timestamptz AND d.creado_en <= $5::timestamptz)
 SELECT to_char(m.mes,'YYYY-MM') mes,count(d.id)::int total,
  count(d.id) FILTER(WHERE d.situacion<>'ANULADO')::int vigentes,
  count(d.id) FILTER(WHERE d.situacion='ANULADO')::int anulados
 FROM meses m LEFT JOIN visibles d ON d.mes=m.mes GROUP BY m.mes ORDER BY m.mes`,
      [...valores, contexto.periodo.desde, contexto.periodo.hasta],
    )
  ).rows;
  return { clave, etiqueta, ...resumen, situaciones, tipos, meses };
}

/** Solo agregados autorizados. La rama administrativa no consulta documentos. */
export async function consultarDashboard(cliente: Conexion, identidad: Actor, referencia?: Date) {
  if (![1, 2, 3, 4, 5].includes(identidad.rol_id) || !identidad.activo)
    throw new HttpError(403, 'Perfil no autorizado');
  const reloj = await contexto(cliente, referencia);
  if (identidad.rol_id === 1 || identidad.rol_id === 2) {
    const datosAdministrativos = await administracion(cliente, identidad);
    const usuarios = datosAdministrativos.cuentas_por_rol.reduce((n, r) => n + r.total, 0);
    const oficinas = datosAdministrativos.actividad_oficinas.reduce((n, r) => n + r.total, 0);
    if (identidad.rol_id === 2)
      return {
        alcance: 'administrativo' as const,
        usuarios,
        oficinas,
        estadisticas: { ...reloj, administracion: datosAdministrativos },
      };
    const global = await grupoDocumental(
      cliente,
      identidad,
      reloj,
      'global',
      'Todos los ámbitos autorizados',
      'true',
    );
    return {
      alcance: 'global' as const,
      usuarios,
      oficinas,
      documentos: global.situaciones.map((r) => ({ situacion: r.etiqueta, total: r.total })),
      estadisticas: {
        ...reloj,
        administracion: datosAdministrativos,
        grupos_documentales: [global],
      },
    };
  }
  const valores = [identidad.id, identidad.rol_id, identidad.ambito_id];
  const estados = (
    await cliente.query(
      `SELECT ${situacionCuentaSQL} situacion,count(*)::int total FROM documentos d WHERE ${lecturaSQL} GROUP BY 1 ORDER BY 1`,
      valores,
    )
  ).rows;
  const recientes = (
    await cliente.query(
      `SELECT d.id::text,d.codigo_visible,d.asunto,${situacionCuentaSQL} situacion,d.creado_en FROM documentos d WHERE
  ${lecturaSQL} ORDER BY d.creado_en DESC,d.id DESC LIMIT 8`,
      valores,
    )
  ).rows;
  const grupos: Grupo[] = [];
  // Los grupos compartido y personal ajeno son disjuntos; Secretaría separa las delegaciones recibidas fuera del ámbito compartido.
  if (identidad.rol_id === 5)
    grupos.push(
      await grupoDocumental(
        cliente,
        identidad,
        reloj,
        'personal',
        'Documentos consultables de tu cuenta',
        'true',
      ),
    );
  else {
    grupos.push(
      await grupoDocumental(
        cliente,
        identidad,
        reloj,
        'compartido',
        'Ámbito compartido de Dirección y Secretaría',
        'd.ambito_id=$3::bigint',
      ),
    );
    if (identidad.rol_id === 3)
      grupos.push(
        await grupoDocumental(
          cliente,
          identidad,
          reloj,
          'personales_ajenos',
          'Ámbitos personales ajenos · solo lectura',
          'd.ambito_id<>$3::bigint',
        ),
      );
    else {
      const recibidos = await grupoDocumental(
        cliente,
        identidad,
        reloj,
        'delegaciones_recibidas',
        'Delegaciones recibidas fuera del ámbito compartido',
        'd.ambito_id<>$3::bigint AND public.documento_delegado_por($1,d.id) IS NOT NULL',
      );
      if (recibidos.total > 0) grupos.push(recibidos);
    }
  }
  return {
    alcance: identidad.rol_id === 5 ? ('personal' as const) : ('institucional' as const),
    estados,
    recientes,
    estadisticas: { ...reloj, grupos_documentales: grupos },
  };
}

/** Identidad y todas las cifras se leen en una misma instantánea de solo lectura. */
export async function dashboardActual(id: string) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const actor = await actorActual(cliente, id);
    const resultado = await consultarDashboard(cliente, actor);
    await cliente.query('COMMIT');
    return resultado;
  } catch (e) {
    await cliente.query('ROLLBACK');
    throw e;
  } finally {
    cliente.release();
  }
}
