import type { PoolClient } from 'pg';
import type { z } from 'zod';
import {
  operacion,
  exigirAdministracion,
  exigirAmbito,
  auditarConfiguracion,
  type Actor,
} from '../../shared/documental/nucleo.js';
import { HttpError } from '../../shared/http/HttpError.js';
import {
  nombre,
  tipo,
  unidad,
  campo,
  renombrar,
  oficinaEdicion,
  oficinaActividad,
  tipoEdicion,
  motivoTipo,
} from './administracion.schema.js';
import { nombresRolSQL } from '../../shared/security/roles.js';
/** Sirve GET /roles; las oficinas se consultan por su propia ruta. */
export async function catalogos(actor: string) {
  return operacion(actor, 'Catálogos administrativos', async (cliente, identidad) => {
    exigirAdministracion(identidad);
    return {
      roles: (
        await cliente.query(`SELECT r.id,${nombresRolSQL} nombre,r.codigo FROM roles r ORDER BY id`)
      ).rows,
    };
  });
}
/** Incluye las oficinas inactivas para conservar visibles las asociaciones existentes. */
export async function oficinas(actor: string) {
  return operacion(actor, 'Oficinas', async (cliente, identidad) => {
    exigirAdministracion(identidad);
    return {
      oficinas: (await cliente.query('SELECT id::text,nombre,activa FROM oficinas ORDER BY nombre'))
        .rows,
    };
  });
}
/** Crea y audita una oficina sin trasladar cuentas ni documentos. */
export async function crearOficina(actor: string, datos: z.infer<typeof nombre>) {
  return operacion(actor, 'Crear oficina', async (cliente, identidad) => {
    exigirAdministracion(identidad);
    const u = (
      await cliente.query('INSERT INTO oficinas(nombre) VALUES($1) RETURNING id::text', [
        datos.nombre,
      ])
    ).rows[0];
    await auditarConfiguracion(cliente, identidad, 'OFICINA', u.id, 'CREAR', null, datos);
    return u;
  });
}
/** Conserva los nombres de Dirección y Mesa de Partes que exige el esquema. */
export async function editarOficina(
  actor: string,
  oficina: string,
  datos: z.infer<typeof oficinaEdicion>,
) {
  return operacion(actor, datos.motivo, async (cliente, identidad) => {
    exigirAdministracion(identidad);
    const anterior = (
      await cliente.query('SELECT id::text,nombre,activa FROM oficinas WHERE id=$1 FOR UPDATE', [
        oficina,
      ])
    ).rows[0];
    if (!anterior) throw new HttpError(404, 'Oficina inexistente');
    if (
      ['Dirección', 'Mesa de Partes'].includes(anterior.nombre) &&
      datos.nombre !== anterior.nombre
    )
      throw new HttpError(
        409,
        'Se conservan las oficinas institucionales requeridas por el esquema',
      );
    await cliente.query('UPDATE oficinas SET nombre=$2 WHERE id=$1', [oficina, datos.nombre]);
    await auditarConfiguracion(cliente, identidad, 'OFICINA', oficina, 'EDITAR', anterior, datos);
    return { actualizado: true };
  });
}
/** Consulta solo el catálogo del ámbito revalidado del actor. */
export async function tipos(actor: string) {
  return operacion(actor, 'Tipos propios', async (cliente, identidad) => {
    const ambito = exigirAmbito(identidad);
    return {
      tipos: (
        await cliente.query(
          `SELECT t.id::text,t.nombre,t.prefijo,t.activo,
            t.creado_por=$2::bigint editable,
            EXISTS(SELECT 1 FROM documentos d WHERE d.tipo_id=t.id) en_uso
          FROM tipos_documentales t WHERE t.ambito_id=$1 ORDER BY t.nombre`,
          [ambito, identidad.id],
        )
      ).rows,
    };
  });
}
/** El ámbito procede del actor y nunca del cuerpo enviado por el cliente. */
export async function crearTipo(actor: string, datos: z.infer<typeof tipo>) {
  return operacion(actor, 'Crear tipo', async (cliente, identidad) => {
    const ambito = exigirAmbito(identidad);
    const t = (
      await cliente.query(
        'INSERT INTO tipos_documentales(ambito_id,nombre,prefijo,creado_por) VALUES($1,$2,$3,$4) RETURNING id::text',
        [ambito, datos.nombre, datos.prefijo, identidad.id],
      )
    ).rows[0];
    await auditarConfiguracion(cliente, identidad, 'TIPO_DOCUMENTAL', t.id, 'CREAR', null, datos);
    return t;
  });
}
/** Revalida ámbito y creador; compartir catálogo no autoriza a editar tipos de otra cuenta. */
async function tipoPropio(cliente: PoolClient, identidad: Actor, id: string) {
  const ambito = exigirAmbito(identidad);
  const t = (await cliente.query(
    'SELECT id::text,nombre,prefijo,activo,creado_por::text FROM tipos_documentales WHERE id=$1 AND ambito_id=$2 FOR UPDATE',
    [id, ambito],
  )).rows[0];
  if (!t) throw new HttpError(404, 'Tipo documental inexistente');
  if (t.creado_por !== identidad.id)
    throw new HttpError(403, 'Solo quien creó el tipo documental puede modificarlo');
  return t;
}
/** Los documentos conservan nombre y código históricos; un prefijo usado no se reutiliza. */
export async function editarTipo(actor: string, id: string, datos: z.infer<typeof tipoEdicion>) {
  return operacion(actor, datos.motivo, async (cliente, identidad) => {
    const anterior = await tipoPropio(cliente, identidad, id);
    if (datos.prefijo !== anterior.prefijo &&
      (await cliente.query('SELECT 1 FROM documentos WHERE tipo_id=$1 LIMIT 1', [id])).rowCount)
      throw new HttpError(409, 'El prefijo ya tiene documentos; puedes cambiar el nombre o desactivar el tipo');
    await cliente.query('UPDATE tipos_documentales SET nombre=$2,prefijo=$3,activo=$4 WHERE id=$1',
      [id, datos.nombre, datos.prefijo, datos.activo]);
    await auditarConfiguracion(cliente, identidad, 'TIPO_DOCUMENTAL', id, 'EDITAR', anterior, datos);
    return { actualizado: true };
  });
}
/** Solo se elimina un tipo sin documentos ni correlativos; los usados se desactivan. */
export async function eliminarTipo(actor: string, id: string, datos: z.infer<typeof motivoTipo>) {
  return operacion(actor, datos.motivo, async (cliente, identidad) => {
    const anterior = await tipoPropio(cliente, identidad, id);
    if ((await cliente.query(`SELECT 1 FROM documentos WHERE tipo_id=$1
      UNION ALL SELECT 1 FROM correlativos_documentales WHERE tipo_id=$1 LIMIT 1`, [id])).rowCount)
      throw new HttpError(409, 'El tipo tiene documentos o numeración reservada; desactívalo para conservar el historial');
    await cliente.query('DELETE FROM tipos_documentales WHERE id=$1', [id]);
    await auditarConfiguracion(cliente, identidad, 'TIPO_DOCUMENTAL', id, 'ELIMINAR', anterior, null);
    return { actualizado: true };
  });
}
/** Solo administración puede escoger otro titular; el Administrador no alcanza al Superadministrador. */
async function propietario(cliente: PoolClient, identidad: Actor, solicitado?: string) {
  if (solicitado && solicitado !== identidad.id) exigirAdministracion(identidad);
  const titular = solicitado ?? identidad.id;
  if (
    identidad.rol_id === 2 &&
    !(await cliente.query('SELECT 1 FROM usuarios WHERE id=$1 AND rol_id<>1', [titular])).rowCount
  )
    throw new HttpError(404, 'Cuenta inexistente');
  return titular;
}
/** Consulta unidades del titular autorizado sin ampliar el alcance por oficina. */
export async function unidades(actor: string, usuario?: string) {
  return operacion(actor, 'Ubicaciones', async (cliente, identidad) => {
    const titular = await propietario(cliente, identidad, usuario);
    return {
      unidades: (
        await cliente.query(
          `SELECT id::text,propietario_id::text,oficina_id::text,clase,nombre,
  padre_id::text,activo FROM unidades_ubicacion WHERE propietario_id=$1 ORDER BY id`,
          [titular],
        )
      ).rows,
    };
  });
}
/** Requiere titular activo con oficina; el trigger valida la jerarquía. */
export async function crearUnidad(actor: string, datos: z.infer<typeof unidad>) {
  return operacion(actor, 'Crear ubicación', async (cliente, identidad) => {
    const titular = await propietario(cliente, identidad, datos.propietario_id),
      u = (
        await cliente.query(
          'SELECT oficina_id::text FROM usuarios WHERE id=$1 AND activo FOR SHARE',
          [titular],
        )
      ).rows[0];
    if (!u?.oficina_id)
      throw new HttpError(409, 'La cuenta necesita oficina para tener ubicaciones');
    const t = (
      await cliente.query(
        'INSERT INTO unidades_ubicacion(propietario_id,oficina_id,clase,nombre,padre_id) VALUES($1,$2,$3,$4,$5) RETURNING id::text',
        [titular, u.oficina_id, datos.clase, datos.nombre, datos.padre_id],
      )
    ).rows[0];
    await auditarConfiguracion(cliente, identidad, 'UBICACION', t.id, 'CREAR', null, datos);
    return t;
  });
}
/** Edita una unidad autorizada sin transferir propietario ni oficina. */
export async function editarUnidad(actor: string, unidadId: string, datos: z.infer<typeof unidad>) {
  return operacion(actor, 'Editar ubicación', async (cliente, identidad) => {
    const u = (
      await cliente.query(
        'SELECT id::text,propietario_id::text,clase,nombre,padre_id::text FROM unidades_ubicacion WHERE id=$1 FOR UPDATE',
        [unidadId],
      )
    ).rows[0];
    if (!u) throw new HttpError(404, 'Unidad inexistente');
    if (u.propietario_id !== identidad.id) exigirAdministracion(identidad);
    if (datos.propietario_id && datos.propietario_id !== u.propietario_id)
      throw new HttpError(400, 'No se transfiere la ubicación');
    await cliente.query(
      'UPDATE unidades_ubicacion SET clase=$2,nombre=$3,padre_id=$4 WHERE id=$1',
      [unidadId, datos.clase, datos.nombre, datos.padre_id],
    );
    await auditarConfiguracion(cliente, identidad, 'UBICACION', unidadId, 'EDITAR', u, datos);
    return { actualizado: true };
  });
}
/** Consulta nombres actuales sin alterar los nombres históricos de documentos. */
export async function campos(actor: string, usuario?: string) {
  return operacion(actor, 'Campos', async (cliente, identidad) => {
    const titular = await propietario(cliente, identidad, usuario);
    return {
      campos: (
        await cliente.query(
          'SELECT id::text,usuario_id::text,nombre_actual FROM campos_opcionales WHERE usuario_id=$1 ORDER BY id',
          [titular],
        )
      ).rows,
    };
  });
}
/** Reserva la creación a administración y a titulares con rol documental. */
export async function crearCampo(actor: string, datos: z.infer<typeof campo>) {
  return operacion(actor, 'Crear campo', async (cliente, identidad) => {
    exigirAdministracion(identidad);
    if (
      !(
        await cliente.query('SELECT 1 FROM usuarios WHERE id=$1 AND rol_id IN (3,4,5)', [
          datos.usuario_id,
        ])
      ).rowCount
    )
      throw new HttpError(400, 'El campo pertenece a una cuenta documental');
    const t = (
      await cliente.query(
        'INSERT INTO campos_opcionales(usuario_id,nombre_actual,creado_por) VALUES($1,$2,$3) RETURNING id::text',
        [datos.usuario_id, datos.nombre, identidad.id],
      )
    ).rows[0];
    await auditarConfiguracion(cliente, identidad, 'CAMPO_OPCIONAL', t.id, 'CREAR', null, datos);
    return t;
  });
}
/** El trigger conserva la historia del nombre y el motivo de esta transacción. */
export async function renombrarCampo(
  actor: string,
  campoId: string,
  datos: z.infer<typeof renombrar>,
) {
  return operacion(actor, datos.motivo, async (cliente, identidad) => {
    exigirAdministracion(identidad);
    const r = await cliente.query('UPDATE campos_opcionales SET nombre_actual=$2 WHERE id=$1', [
      campoId,
      datos.nombre,
    ]);
    if (!r.rowCount) throw new HttpError(404, 'Campo inexistente');
    return { actualizado: true };
  });
}
/** Permite consultar una oficina administrativa aunque esté inactiva. */
export async function detalleOficina(actor: string, oficina: string) {
  return operacion(actor, 'Consulta de oficina', async (cliente, identidad) => {
    exigirAdministracion(identidad);
    const o = (
      await cliente.query('SELECT id::text,nombre,activa FROM oficinas WHERE id=$1', [oficina])
    ).rows[0];
    if (!o) throw new HttpError(404, 'Oficina inexistente');
    return { oficina: o };
  });
}
/** Mantiene activas las oficinas institucionales y audita solo cambios efectivos. */
export async function cambiarActividadOficina(
  actor: string,
  oficina: string,
  datos: z.infer<typeof oficinaActividad>,
) {
  return operacion(actor, datos.motivo, async (cliente, identidad) => {
    exigirAdministracion(identidad);
    const o = (
      await cliente.query('SELECT id::text,nombre,activa FROM oficinas WHERE id=$1 FOR UPDATE', [
        oficina,
      ])
    ).rows[0];
    if (!o) throw new HttpError(404, 'Oficina inexistente');
    if (['Dirección', 'Mesa de Partes'].includes(o.nombre) && !datos.activa)
      throw new HttpError(409, 'Dirección y Mesa de Partes deben permanecer activas');
    if (o.activa === datos.activa) return { actualizado: true };
    await cliente.query('UPDATE oficinas SET activa=$2 WHERE id=$1', [oficina, datos.activa]);
    await auditarConfiguracion(
      cliente,
      identidad,
      'OFICINA',
      oficina,
      datos.activa ? 'ACTIVAR' : 'DESACTIVAR',
      { activa: o.activa },
      { activa: datos.activa },
    );
    return { actualizado: true };
  });
}
