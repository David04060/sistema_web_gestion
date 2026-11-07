import type { PoolClient } from 'pg';
import type { z } from 'zod';
import {
  usuarioAlta,
  usuarioEdicion,
  actividad,
  filtrosUsuarios,
} from './administracion.schema.js';
export {
  usuarioAlta,
  usuarioEdicion,
  nombre,
  tipo,
  unidad,
  campo,
  renombrar,
  oficinaEdicion,
  oficinaActividad,
  tipoEdicion,
  motivoTipo,
  actividad,
  filtrosUsuarios,
} from './administracion.schema.js';
import {
  operacion,
  exigirAdministracion,
  auditarConfiguracion,
  type Actor,
} from '../../shared/documental/nucleo.js';
import { generarHash } from '../../shared/security/password.js';
import { HttpError } from '../../shared/http/HttpError.js';
import { nombresRolSQL } from '../../shared/security/roles.js';

/** Permite conservar una oficina inactiva ya asignada; los cambios exigen una oficina activa y compatible con el rol. */
async function validarOficina(
  cliente: PoolClient,
  rol: number,
  oficina: string | null,
  oficinaActual: string | null = null,
) {
  const o = oficina
    ? (await cliente.query('SELECT nombre,activa FROM oficinas WHERE id=$1 FOR SHARE', [oficina]))
        .rows[0]
    : null;
  if (oficina && !o) throw new HttpError(400, 'Oficina inexistente');
  if (o && !o.activa && oficina !== oficinaActual)
    throw new HttpError(409, 'La oficina está inactiva; selecciona una oficina activa');
  if ([1, 2].includes(rol) && oficina)
    throw new HttpError(400, 'Las cuentas administrativas no tienen oficina documental');
  if (oficina && ((rol === 3 && o?.nombre !== 'Dirección') || (rol === 4 && o?.nombre !== 'Mesa de Partes')))
    throw new HttpError(400, 'Selecciona la oficina correspondiente al rol');
  if (rol === 5 && ['Dirección', 'Mesa de Partes'].includes(o?.nombre))
    throw new HttpError(400, 'Usuario no puede asignarse a Dirección ni a Mesa de Partes');
}

/** Conserva activo al Superadministrador único y revoca sesiones cuando cambia la actividad. */
export async function cambiarActividad(
  actor: string,
  usuario: string,
  datos: z.infer<typeof actividad>,
) {
  return operacion(actor, datos.motivo, async (cliente, identidad) => {
    exigirAdministracion(identidad);
    const u = (
      await cliente.query(
        'SELECT id::text,rol_id,activo FROM usuarios WHERE id=$1 AND ($2::smallint=1 OR rol_id<>1) FOR UPDATE',
        [usuario, identidad.rol_id],
      )
    ).rows[0];
    if (!u) throw new HttpError(404, 'Cuenta inexistente');
    if (u.rol_id === 1 && !datos.activo)
      throw new HttpError(409, 'El Superadministrador único no puede desactivarse');
    if (u.activo === datos.activo) return { actualizado: true };
    await cliente.query(
      'UPDATE usuarios SET activo=$2,version_autenticacion=version_autenticacion+1 WHERE id=$1',
      [usuario, datos.activo],
    );
    await auditarConfiguracion(
      cliente,
      identidad,
      'USUARIO',
      usuario,
      datos.activo ? 'ACTIVAR' : 'DESACTIVAR',
      { activo: u.activo },
      { activo: datos.activo },
    );
    return { actualizado: true };
  });
}

const columnasUsuario = `u.id::text,u.nombre,u.apellido,u.nombre_usuario,u.email,u.telefono,u.activo,
  u.rol_id,u.oficina_id::text,${nombresRolSQL} rol,o.nombre oficina`;
/** Reconstruye pertenencias al cambiar el rol; reutiliza el ámbito personal para conservar la historia. */
async function miembros(cliente: PoolClient, usuario: string, rol: number) {
  await cliente.query('DELETE FROM miembros_ambito WHERE usuario_id=$1', [usuario]);
  if (rol === 5) {
    let ambito = (
      await cliente.query(
        "SELECT id::text FROM ambitos_registro WHERE clase='PERSONAL' AND titular_id=$1",
        [usuario],
      )
    ).rows[0];
    if (!ambito)
      ambito = (
        await cliente.query(
          "INSERT INTO ambitos_registro(clase,titular_id) VALUES('PERSONAL',$1) RETURNING id::text",
          [usuario],
        )
      ).rows[0];
    await cliente.query('INSERT INTO miembros_ambito(usuario_id,ambito_id) VALUES($1,$2)', [
      usuario,
      ambito.id,
    ]);
  }
  if ([3, 4].includes(rol))
    await cliente.query(
      "INSERT INTO miembros_ambito(usuario_id,ambito_id) SELECT $1,id FROM ambitos_registro WHERE clase='COMPARTIDO_DIRECCION'",
      [usuario],
    );
}
/** Solo el Superadministrador puede administrar su propia cuenta protegida. */
function protegerCuenta(identidad: Actor, rol: number) {
  if (identidad.rol_id !== 1 && rol === 1)
    throw new HttpError(403, 'Solo Superadministrador administra esa cuenta');
}

/** Filtra en SQL las cuentas visibles; el Administrador no recibe la cuenta del Superadministrador. */
export async function usuarios(actor: string, f: z.infer<typeof filtrosUsuarios> = { q: '' }) {
  return operacion(actor, 'Consulta administrativa', async (cliente, identidad) => {
    exigirAdministracion(identidad);
    const filas = (
      await cliente.query(
        `SELECT ${columnasUsuario} FROM usuarios u JOIN roles r ON r.id=u.rol_id LEFT JOIN oficinas o ON o.id=u.oficina_id
  WHERE ($1::smallint=1 OR u.rol_id<>1) AND ($2::text='' OR strpos(lower(concat_ws(' ',
  u.nombre,u.apellido,u.nombre_usuario,u.email)),lower($2))>0) AND ($3::smallint IS NULL OR
  u.rol_id=$3) AND ($4::boolean IS NULL OR u.activo=$4) ORDER BY u.id`,
        [identidad.rol_id, f.q, f.rol_id ?? null, f.activo ?? null],
      )
    ).rows;
    return { usuarios: filas, total: filas.length };
  });
}
/** Aplica el mismo alcance que el listado y devuelve solo columnas públicas. */
export async function detalleUsuario(actor: string, usuario: string) {
  return operacion(actor, 'Consulta administrativa', async (cliente, identidad) => {
    exigirAdministracion(identidad);
    const u = (
      await cliente.query(
        `SELECT ${columnasUsuario} FROM usuarios u JOIN roles r ON r.id=u.rol_id LEFT JOIN oficinas o ON o.id=u.oficina_id
  WHERE u.id=$1 AND ($2::smallint=1 OR u.rol_id<>1)`,
        [usuario, identidad.rol_id],
      )
    ).rows[0];
    if (!u) throw new HttpError(404, 'Cuenta inexistente');
    return { usuario: u };
  });
}
/** Crea cuenta, pertenencia y auditoría atómicamente; excluye la contraseña de la auditoría. */
export async function crearUsuario(actor: string, datos: z.infer<typeof usuarioAlta>) {
  return operacion(actor, 'Crear cuenta', async (cliente, identidad) => {
    exigirAdministracion(identidad);
    if (datos.rol_id === 1)
      throw new HttpError(409, 'La cuenta Superadministrador ya existe; no se permite crear otra');
    await validarOficina(cliente, datos.rol_id, datos.oficina_id);
    const u = (
      await cliente.query(
        `INSERT INTO usuarios(nombre,apellido,nombre_usuario,email,telefono,
  rol_id,oficina_id,contrasena_hash) VALUES($1,$2,$3,$4,$5,$6,
  $7,$8) RETURNING id::text`,
        [
          datos.nombre,
          datos.apellido,
          datos.nombre_usuario,
          datos.email,
          datos.telefono,
          datos.rol_id,
          datos.oficina_id,
          await generarHash(datos.contrasena),
        ],
      )
    ).rows[0];
    await miembros(cliente, u.id, datos.rol_id);
    await auditarConfiguracion(cliente, identidad, 'USUARIO', u.id, 'CREAR', null, {
      ...datos,
      contrasena: undefined,
    });
    return { id: u.id };
  });
}
/** Bloquea la cuenta, conserva su ámbito si tiene documentos y revoca sesiones al editar. */
export async function editarUsuario(
  actor: string,
  usuario: string,
  datos: z.infer<typeof usuarioEdicion>,
) {
  return operacion(actor, datos.motivo, async (cliente, identidad) => {
    exigirAdministracion(identidad);
    const previo = (
      await cliente.query(
        'SELECT id::text,rol_id,oficina_id::text,activo FROM usuarios WHERE id=$1 AND ($2::smallint=1 OR rol_id<>1) FOR UPDATE',
        [usuario, identidad.rol_id],
      )
    ).rows[0];
    if (!previo) throw new HttpError(404, 'Cuenta inexistente');
    protegerCuenta(identidad, previo.rol_id);
    if (datos.rol_id === 1 && previo.rol_id !== 1)
      throw new HttpError(409, 'No se permite convertir una cuenta a Superadministrador');
    if (previo.rol_id === 1 && datos.rol_id !== 1)
      throw new HttpError(409, 'Se conserva el Superadministrador único activo');
    if (
      previo.rol_id !== datos.rol_id &&
      (await cliente.query('SELECT 1 FROM documentos WHERE registrado_por=$1 LIMIT 1', [usuario]))
        .rowCount
    )
      throw new HttpError(409, 'La cuenta tiene registros históricos; no puede cambiar de ámbito');
    await validarOficina(cliente, datos.rol_id, datos.oficina_id, previo.oficina_id);
    await cliente.query(
      `UPDATE usuarios SET nombre=$2,apellido=$3,nombre_usuario=$4,email=$5,
  telefono=$6,rol_id=$7,oficina_id=$8,version_autenticacion=version_autenticacion+1 WHERE id=$1`,
      [
        usuario,
        datos.nombre,
        datos.apellido,
        datos.nombre_usuario,
        datos.email,
        datos.telefono,
        datos.rol_id,
        datos.oficina_id,
      ],
    );
    if (previo.rol_id !== datos.rol_id) await miembros(cliente, usuario, datos.rol_id);
    await auditarConfiguracion(cliente, identidad, 'USUARIO', usuario, 'EDITAR', previo, datos);
    return { actualizado: true };
  });
}
/** Actualiza hash y versión de sesión; la auditoría nunca contiene la contraseña. */
export async function cambiarClave(actor: string, usuario: string, contrasena: string) {
  return operacion(actor, 'Cambio de credencial', async (cliente, identidad) => {
    exigirAdministracion(identidad);
    const u = (
      await cliente.query(
        'SELECT rol_id FROM usuarios WHERE id=$1 AND ($2::smallint=1 OR rol_id<>1) FOR UPDATE',
        [usuario, identidad.rol_id],
      )
    ).rows[0];
    if (!u) throw new HttpError(404, 'Cuenta inexistente');
    protegerCuenta(identidad, u.rol_id);
    await cliente.query(
      'UPDATE usuarios SET contrasena_hash=$2,version_autenticacion=version_autenticacion+1 WHERE id=$1',
      [usuario, await generarHash(contrasena)],
    );
    await auditarConfiguracion(cliente, identidad, 'USUARIO', usuario, 'CREDENCIAL', null, {
      revocada: true,
    });
    return { actualizado: true };
  });
}

// Fachada conservada para los consumidores de las operaciones administrativas vigentes.
export {
  catalogos,
  oficinas,
  crearOficina,
  editarOficina,
  tipos,
  crearTipo,
  editarTipo,
  eliminarTipo,
  unidades,
  crearUnidad,
  editarUnidad,
  campos,
  crearCampo,
  renombrarCampo,
  detalleOficina,
  cambiarActividadOficina,
} from './configuracion.operaciones.js';
