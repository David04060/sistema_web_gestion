import type { PoolClient } from 'pg';
import { periodoRegistro } from './fecha-registro.js';
import type { z } from 'zod';
import {
  alta,
  correccion,
  delegacion,
  ubicacion,
  anulacion,
  filtros,
  consultaDestinatarios,
} from './documental.schema.js';
export {
  id,
  alta,
  correccion,
  delegacion,
  ubicacion,
  anulacion,
  filtros,
} from './documental.schema.js';
import { datosAuditoria } from './auditoria.documental.js';
import {
  operacion,
  documento,
  exigirAmbito,
  exigirRevision,
  lecturaSQL,
  permisos,
  type Actor,
} from '../../shared/documental/nucleo.js';
import { HttpError } from '../../shared/http/HttpError.js';

/** Consulta catálogos del ámbito y campos propios. */
export async function opciones(actor: string) {
  return operacion(actor, 'Opciones documentales', async (cliente, identidad) => {
    const ambito = exigirAmbito(identidad);
    return {
      ambito_id: ambito,
      tipos: (
        await cliente.query(
          'SELECT id::text,nombre,prefijo FROM tipos_documentales WHERE ambito_id=$1 AND activo ORDER BY nombre',
          [ambito],
        )
      ).rows,
      campos: (
        await cliente.query(
          'SELECT id::text,nombre_actual FROM campos_opcionales WHERE usuario_id=$1 ORDER BY id',
          [identidad.id],
        )
      ).rows,
      // Compatibilidad con pestañas que aún cargaron el selector anterior.
      destinatarios: (await cliente.query(
        "SELECT id::text,concat_ws(' ',nombre,apellido) nombre,oficina_id::text FROM usuarios WHERE activo ORDER BY nombre,apellido,id LIMIT 20",
      )).rows,
      oficinas: (
        await cliente.query('SELECT id::text,nombre FROM oficinas WHERE activa ORDER BY nombre')
      ).rows,
    };
  });
}

const unidadPropiaActiva = 'u.propietario_id=$1 AND u.oficina_id=$2 AND u.activo';

/** Recorre ramas activas de la cuenta autenticada y limita los resultados en PostgreSQL. */
export async function buscarUbicaciones(actor: string, q: string) {
  return operacion(actor, 'Buscar ubicación', async (cliente, identidad) => {
    exigirAmbito(identidad);
    const limite = q ? 20 : 5;
    const { rows } = await cliente.query<{ id: string; ruta: string }>(
      `WITH RECURSIVE lugares AS (
         SELECT u.id,
           CASE WHEN u.clase='Lugar' THEN u.nombre ELSE u.clase||': '||u.nombre END AS ruta,
           u.clase, false AS contenido
         FROM unidades_ubicacion u JOIN oficinas o ON o.id=u.oficina_id AND o.activa
         WHERE ${unidadPropiaActiva} AND u.padre_id IS NULL
         UNION ALL
         SELECT u.id, l.ruta||' › '||u.nombre, u.clase, true
         FROM lugares l JOIN unidades_ubicacion u ON u.padre_id=l.id
         WHERE ${unidadPropiaActiva}
       ), etiquetas AS (
         SELECT id, CASE WHEN contenido THEN ruta||' · '||clase ELSE ruta END AS ruta
         FROM lugares
       )
       SELECT id::text, ruta FROM etiquetas
       WHERE strpos(translate(lower(ruta), 'áéíóúü', 'aeiouu'),
                    translate(lower($3), 'áéíóúü', 'aeiouu')) > 0
       ORDER BY ruta, etiquetas.id LIMIT $4`,
      [identidad.id, identidad.oficina_id, q, limite + 1],
    );
    return { ubicaciones: rows.slice(0, limite), hay_mas: rows.length > limite };
  });
}
/** Aplica lectura autorizada antes de contar y paginar; los anulados exigen petición expresa del Superadministrador. */
export async function listar(actor: string, f: z.infer<typeof filtros>) {
  return operacion(actor, 'Consulta', async (cliente, identidad) => {
    if (f.situacion === 'ANULADO' && identidad.rol_id !== 1)
      throw new HttpError(403, 'Solo Superadministrador consulta anulados');
    const periodo = periodoRegistro(f.fecha);
    const valores = [
      identidad.id,
      identidad.rol_id,
      identidad.ambito_id,
      '%' + f.q.replace(/[\\%_]/g, '\\$&') + '%',
      f.situacion ?? null,
      f.tipo_id ?? null,
      f.clasificacion ?? null,
      f.limite,
      (f.pagina - 1) * f.limite,
      periodo.inicio,
      periodo.intervalo,
    ];
    const base = `FROM documentos d WHERE ${lecturaSQL} AND ($2::smallint<>1 OR $5::text IS NOT NULL OR d.situacion<>'ANULADO')
  AND concat_ws(' ',d.codigo_visible,d.asunto,d.remitente) ILIKE $4 ESCAPE E'\\\\' AND ($5::text
  IS NULL OR d.situacion=$5) AND ($6::bigint IS NULL OR d.tipo_id=$6) AND ($7::text IS NULL
  OR d.clasificacion=$7) AND ($10::date IS NULL OR (d.creado_en>=($10::date::timestamp AT TIME
  ZONE 'America/Lima') AND d.creado_en<(($10::date+$11::interval) AT TIME ZONE 'America/Lima')))`;
    const r = await cliente.query(
      `WITH visibles AS (SELECT to_jsonb(d)||jsonb_build_object('id',
  d.id::text,'ambito_id',d.ambito_id::text,'tipo_id',d.tipo_id::text,
  'registrado_por',d.registrado_por::text,'ubicacion_ruta',(SELECT l.ruta_ubicacion_guardada
  FROM ubicaciones_documento l WHERE l.documento_id=d.id AND l.vigente),
  'revision',d.revision::text,'registrado_por_oficina',(SELECT o.nombre FROM usuarios u LEFT
  JOIN oficinas o ON o.id=u.oficina_id WHERE u.id=d.registrado_por),
  'registrado_por_nombre',(SELECT concat_ws(' ',u.nombre,u.apellido) FROM usuarios u WHERE
  u.id=d.registrado_por)) fila,d.id orden,d.creado_en ${base}) SELECT (SELECT count(*)::int FROM visibles)
  total,coalesce((SELECT jsonb_agg(v.fila) FROM (SELECT fila FROM visibles ORDER BY creado_en
  DESC,orden DESC LIMIT $8 OFFSET $9) v),'[]'::jsonb) documentos`,
      valores,
    );
    return { ...r.rows[0], pagina: f.pagina, limite: f.limite };
  });
}
/** Revalida también la visibilidad de cada relacionado; la delegación es informativa y no transfiere la autoría. */
export async function detalle(actor: string, documentoId: string) {
  return operacion(actor, 'Consulta', async (cliente, identidad) => {
    const d = await documento(cliente, identidad, documentoId);
    const valores = (
      await cliente.query(
        'SELECT campo_id::text,nombre_guardado,valor FROM valores_documento WHERE documento_id=$1 ORDER BY campo_id',
        [documentoId],
      )
    ).rows;
    const destino =
      (
        await cliente.query(
          `SELECT e.*,e.usuario_indicado_id::text,e.oficina_indicada_id::text,
  concat_ws(' ',u.nombre,u.apellido) actor FROM delegaciones_documento e JOIN usuarios u ON
  u.id=e.delegado_por WHERE documento_id=$1`,
          [documentoId],
        )
      ).rows[0] ?? null;
    const lugar =
      (
        await cliente.query(
          `SELECT unidad_id::text,oficina_nombre_guardado,ruta_ubicacion_guardada,
  registrado_en FROM ubicaciones_documento WHERE documento_id=$1 AND vigente`,
          [documentoId],
        )
      ).rows[0] ?? null;
    const relacionados = (
      await cliente.query(
        `SELECT d.id::text,d.codigo_visible,d.asunto,r.origen_id::text FROM documentos_relaciones r
  JOIN documentos d ON (r.documento_id=$1 AND d.id=r.origen_id) OR (r.origen_id=$1 AND d.id=r.documento_id)
  WHERE ${lecturaSQL}`,
        [documentoId, identidad.rol_id, identidad.ambito_id],
      )
    ).rows;
    return {
      documento: {
        ...d,
        valores,
        delegacion: destino,
        ubicacion: lugar,
        relacionados,
        permisos: permisos(identidad, d),
      },
    };
  });
}
/** Exige lectura del documento antes de devolver su historia original. */
export async function historial(actor: string, documentoId: string) {
  return operacion(actor, 'Consulta', async (cliente, identidad) => {
    await documento(cliente, identidad, documentoId);
    return {
      historial: (
        await cliente.query(
          `SELECT h.id::text,h.accion,h.motivo,h.anterior,h.posterior,h.fecha,
  h.actor_id::text,concat_ws(' ',u.nombre,u.apellido) actor FROM auditoria_documental h JOIN
  usuarios u ON u.id=h.actor_id WHERE documento_id=$1 ORDER BY h.fecha,
  h.id`,
          [documentoId],
        )
      ).rows,
    };
  });
}
/** Busca por nombre con límite fijo y devuelve oficina y cuenta para distinguir homónimos. */
export async function buscarDestinatarios(actor: string, filtro: z.infer<typeof consultaDestinatarios>) {
  return operacion(actor, 'Buscar destinatarios', async (cliente, identidad) => {
    exigirAmbito(identidad);
    const limite = filtro.q ? 20 : 8;
    const resultado = await cliente.query(
      `WITH recientes AS (
         SELECT usuario_indicado_id, max(delegado_en) ultima
         FROM delegaciones_documento
         WHERE $1='' AND delegado_por=$3 AND usuario_indicado_id IS NOT NULL
         GROUP BY usuario_indicado_id
       ), elegibles AS (
         SELECT u.id,u.nombre,u.apellido,u.nombre_usuario,o.nombre oficina,r.ultima
         FROM usuarios u
         LEFT JOIN oficinas o ON o.id=u.oficina_id
         LEFT JOIN recientes r ON r.usuario_indicado_id=u.id
         WHERE u.activo AND ($2::bigint IS NULL OR u.oficina_id=$2)
           AND ($1='' OR strpos(lower(concat_ws(' ',u.nombre,u.apellido)),lower($1))>0
             OR strpos(lower(u.nombre_usuario),lower($1))>0)
       )
       SELECT id::text,concat_ws(' ',nombre,apellido) nombre,nombre_usuario,oficina
       FROM elegibles
       WHERE ultima IS NOT NULL OR NOT EXISTS (SELECT 1 FROM elegibles WHERE ultima IS NOT NULL)
       ORDER BY ultima DESC NULLS LAST,nombre,apellido,id LIMIT $4`,
      [filtro.q, filtro.oficina_id ?? null, identidad.id, limite + 1],
    );
    return { personas: resultado.rows.slice(0, limite), hay_mas: resultado.rows.length > limite };
  });
}

/** Alta atómica con valores históricos, relación y ubicación; el trigger asigna el correlativo. */
export async function registrar(actor: string, datos: z.infer<typeof alta>) {
  const nuevo = await operacion(actor, 'Registro', async (cliente, identidad) => {
    const ambito = exigirAmbito(identidad);
    if (datos.conservar_en_mesa && identidad.rol_id !== 4)
      throw new HttpError(403, 'Solo Secretaría conserva en Mesa de Partes');
    if (datos.destino && identidad.rol_id === 4 && !datos.conservar_en_mesa)
      throw new HttpError(400, 'Para delegar al registrar, Secretaría debe conservar en Mesa de Partes');
    if (datos.destino && identidad.rol_id === 3 && datos.unidad_id)
      throw new HttpError(400, 'La delegación inmediata no admite guardar en Dirección');
    if (datos.unidad_id) {
      if (identidad.rol_id === 4 && !datos.conservar_en_mesa)
        throw new HttpError(400, 'Para indicar ubicación, conserva el documento en Mesa de Partes');
      await exigirUnidadVigente(cliente, identidad, datos.unidad_id);
    }
    if (datos.origen_id) {
      const origen = await documento(cliente, identidad, datos.origen_id, true);
      if (origen.ambito_id !== ambito) throw new HttpError(403, 'Origen fuera de su ámbito');
    }
    const situacion =
      identidad.rol_id === 5
        ? 'PERSONAL'
        : identidad.rol_id === 4 && datos.conservar_en_mesa
          ? 'EN_MESA_DE_PARTES'
          : 'PENDIENTE_DIRECCION';
    const d = (
      await cliente.query(
        `INSERT INTO documentos(ambito_id,tipo_id,registrado_por,clasificacion,
  asunto,remitente,observaciones,situacion) VALUES($1,$2,$3,$4,
  $5,$6,$7,$8) RETURNING id::text`,
        [
          ambito,
          datos.tipo_id,
          identidad.id,
          datos.clasificacion,
          datos.asunto,
          datos.remitente,
          datos.observaciones,
          situacion,
        ],
      )
    ).rows[0];
    await registrarValoresIniciales(cliente, identidad.id, d.id, datos.valores);
    if (datos.origen_id)
      await cliente.query(
        'INSERT INTO documentos_relaciones(documento_id,origen_id,creado_por) VALUES($1,$2,$3)',
        [d.id, datos.origen_id, identidad.id],
      );
    if (datos.unidad_id) await registrarUbicacion(cliente, d.id, datos.unidad_id, identidad.id);
    if (datos.destino) {
      const registro = await documento(cliente, identidad, d.id, true);
      if (!permisos(identidad, registro).delegar)
        throw new HttpError(403, 'Delegación no autorizada');
      await insertarDelegacion(cliente, identidad.id, d.id, datos.destino);
    }
    return d.id as string;
  });
  return detalle(actor, nuevo);
}
/** Solo el autor autorizado corrige contenido y campos ya existentes con revisión y motivo. */
export async function corregir(
  actor: string,
  documentoId: string,
  datos: z.infer<typeof correccion>,
) {
  await operacion(actor, datos.motivo, async (cliente, identidad) => {
    const d = await documento(cliente, identidad, documentoId, true);
    if (!permisos(identidad, d).corregir) throw new HttpError(403, 'Corrección no autorizada');
    exigirRevision(d, datos.revision);
    await cliente.query(
      'UPDATE documentos SET asunto=$2,remitente=$3,observaciones=$4 WHERE id=$1',
      [documentoId, datos.asunto, datos.remitente, datos.observaciones],
    );
    for (const campo of datos.valores ?? []) {
      const r = await cliente.query(
        'UPDATE valores_documento SET valor=$3 WHERE documento_id=$1 AND campo_id=$2',
        [documentoId, campo.campo_id, campo.valor],
      );
      if (!r.rowCount) throw new HttpError(400, 'Campo histórico inexistente');
    }
  });
  return detalle(actor, documentoId);
}
/** Comparte validación y escritura entre el alta atómica y la delegación posterior. */
async function insertarDelegacion(
  cliente: PoolClient,
  actor: string,
  documentoId: string,
  datos: Omit<z.infer<typeof delegacion>, 'revision'>,
) {
  let nombre = datos.nombre;
  if (datos.usuario_id) {
    const u = (
      await cliente.query(
        "SELECT oficina_id::text,concat(nombre,' ',apellido) nombre FROM usuarios WHERE id=$1 AND activo FOR SHARE",
        [datos.usuario_id],
      )
    ).rows[0];
    if (!u || (datos.oficina_id && u.oficina_id !== datos.oficina_id))
      throw new HttpError(400, 'Persona y oficina incompatibles');
    nombre = u.nombre;
  }
  await cliente.query(
    `INSERT INTO delegaciones_documento(documento_id,oficina_indicada_id,
usuario_indicado_id,nombre_persona_guardado,observaciones,delegado_por) VALUES($1,
$2,$3,$4,$5,$6)`,
    [documentoId, datos.oficina_id, datos.usuario_id, nombre, datos.observaciones, actor],
  );
}

/** Guarda una persona registrada o manual; valida oficina compatible sin transferir ámbito ni conceder acceso. */
export async function delegar(
  actor: string,
  documentoId: string,
  datos: z.infer<typeof delegacion>,
) {
  await operacion(actor, 'Delegación indicada', async (cliente, identidad) => {
    const d = await documento(cliente, identidad, documentoId, true);
    exigirRevision(d, datos.revision);
    if (!permisos(identidad, d).delegar) throw new HttpError(403, 'Delegación no autorizada');
    await insertarDelegacion(cliente, identidad.id, documentoId, datos);
  });
  return detalle(actor, documentoId);
}
/** Sustituye la ubicación vigente conservando las anteriores y la revisión del documento. */
export async function ubicar(actor: string, documentoId: string, datos: z.infer<typeof ubicacion>) {
  await operacion(actor, 'Ubicación', async (cliente, identidad) => {
    const d = await documento(cliente, identidad, documentoId, true);
    if (!permisos(identidad, d).ubicar) throw new HttpError(403, 'Ubicación no autorizada');
    exigirRevision(d, datos.revision);
    await exigirUnidadVigente(cliente, identidad, datos.unidad_id);
    await cliente.query(
      'UPDATE ubicaciones_documento SET vigente=false WHERE documento_id=$1 AND vigente',
      [documentoId],
    );
    await registrarUbicacion(cliente, documentoId, datos.unidad_id, identidad.id);
    // El trigger de ubicación ya actualiza el documento cuando pasa a Guardado en Dirección.
    if (d.situacion !== 'PENDIENTE_DIRECCION')
      await cliente.query('UPDATE documentos SET revision=revision+1 WHERE id=$1', [documentoId]);
  });
  return detalle(actor, documentoId);
}

/** Comprueba la unidad y sus antecesores dentro de la transacción que la asigna. */
async function exigirUnidadVigente(cliente: PoolClient, identidad: Actor, unidadId: string) {
  const resultado = await cliente.query(
    `WITH RECURSIVE cadena AS (
       SELECT u.id,u.padre_id
       FROM unidades_ubicacion u JOIN oficinas o ON o.id=u.oficina_id AND o.activa
       WHERE ${unidadPropiaActiva} AND u.id=$3
       UNION
       SELECT u.id,u.padre_id FROM cadena c JOIN unidades_ubicacion u ON u.id=c.padre_id
       WHERE ${unidadPropiaActiva}
     )
     SELECT 1 FROM cadena WHERE padre_id IS NULL`,
    [identidad.id, identidad.oficina_id, unidadId],
  );
  if (!resultado.rowCount)
    throw new HttpError(400, 'Selecciona una ubicación propia y vigente');
}
/** Anulación lógica autorizada; conserva registro, historia y vínculo PDF. */
export async function anular(actor: string, documentoId: string, datos: z.infer<typeof anulacion>) {
  await operacion(actor, datos.motivo, async (cliente, identidad) => {
    const d = await documento(cliente, identidad, documentoId, true);
    if (!permisos(identidad, d).anular) throw new HttpError(403, 'Anulación no autorizada');
    exigirRevision(d, datos.revision);
    await cliente.query(
      "UPDATE documentos SET situacion_antes_anulacion=situacion,situacion='ANULADO' WHERE id=$1",
      [documentoId],
    );
  });
  return { anulado: true };
}
/** Proyecta solo cambios públicos y eventos de limpieza PDF; evita exponer JSON interno o claves R2. */
export async function auditoria(actor: string, documentoId: string) {
  return operacion(actor, 'Auditoría documental', async (cliente, identidad) => {
    await documento(cliente, identidad, documentoId);
    const filas = (
      await cliente.query(
        `SELECT 'doc:'||h.id::text id,h.accion,h.motivo,h.anterior,h.posterior,
  h.fecha,concat_ws(' ',u.nombre,u.apellido) actor FROM auditoria_documental h JOIN usuarios
  u ON u.id=h.actor_id WHERE h.documento_id=$1
 UNION ALL SELECT 'pdf:'||p.id::text,'PDF_'||p.accion,
  CASE WHEN p.accion LIKE 'RETENCION_14_DIAS_%' THEN 'Política automática: PDF de registro anulado, retención de 14 días' ELSE NULL END,NULL,
  NULL,p.fecha,CASE WHEN u.id IS NULL THEN NULL ELSE concat_ws(' ',
  u.nombre,u.apellido) END FROM pdf_eventos p LEFT JOIN usuarios u ON u.id=p.actor_id WHERE
  p.documento_id=$1 AND p.accion IN ('LIMPIEZA_PENDIENTE','LIMPIEZA_COMPLETADA','RETENCION_14_DIAS_PENDIENTE','RETENCION_14_DIAS_ELIMINADA') ORDER BY fecha,
  id`,
        [documentoId],
      )
    ).rows;
    return {
      eventos: filas.map((h) => ({
        id: h.id,
        accion: h.accion,
        actor: h.actor,
        fecha: h.fecha,
        motivo: h.motivo,
        datos: datosAuditoria(h.anterior, h.posterior),
      })),
    };
  });
}

/** Captura el nombre histórico de cada campo propio dentro de la misma transacción del alta. */
async function registrarValoresIniciales(
  cliente: PoolClient,
  actorId: string,
  documentoId: string,
  valores: z.infer<typeof alta>['valores'],
) {
  for (const campo of valores) {
    const etiqueta = (
      await cliente.query(
        'SELECT nombre_actual FROM campos_opcionales WHERE id=$1 AND usuario_id=$2 FOR SHARE',
        [campo.campo_id, actorId],
      )
    ).rows[0];
    if (!etiqueta) throw new HttpError(400, 'Campo opcional ajeno');
    await cliente.query(
      'INSERT INTO valores_documento(documento_id,campo_id,nombre_guardado,valor) VALUES($1,$2,$3,$4)',
      [documentoId, campo.campo_id, etiqueta.nombre_actual, campo.valor],
    );
  }
}

/** El trigger guarda la ruta y oficina históricas; el cliente aporta solo una unidad propia. */
async function registrarUbicacion(
  cliente: PoolClient,
  documentoId: string,
  unidadId: string,
  actorId: string,
) {
  await cliente.query(
    `INSERT INTO ubicaciones_documento(documento_id,unidad_id,registrado_por,
  oficina_nombre_guardado,ruta_ubicacion_guardada) VALUES($1,
  $2,$3,'','')`,
    [documentoId, unidadId, actorId],
  );
}
