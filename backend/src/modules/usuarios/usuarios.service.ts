import type { PoolClient } from "pg";
import { escrituraAdministrativa } from "../../shared/admin/admin.repository.js";
import { HttpError } from "../../shared/http/HttpError.js";
import { generarHash } from "../../shared/security/password.js";
import type { CrearUsuario, DatosUsuario, FiltrosUsuarios } from "./usuarios.schema.js";
import * as repository from "./usuarios.repository.js";
/**
 * Delega el listado administrativo validado al repositorio; el middleware de rutas exige el rol Administrador.
 * @param filtros - Filtros validados de búsqueda y paginación.
 */
export const listar = (filtros: FiltrosUsuarios) => repository.listar(filtros);
/**
 * Devuelve la cuenta administrada o genera un 404; permite reutilizar la conexión de una escritura atómica.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 */
export async function detalle(id: string, cliente?: PoolClient) {
    const usuario = await repository.obtener(id, cliente);
    if (!usuario)
        throw new HttpError(404, "Usuario no encontrado");
    return usuario;
}
/** Reglas institucionales aprobadas; ni un ID inexistente ni una oficina incompatible llegan al INSERT/UPDATE. */
async function validarAsignaciones(datos: DatosUsuario, cliente: PoolClient): Promise<string> {
    const { rol, oficina } = await repository.asignaciones(datos.rol_id, datos.oficina_id, cliente);
    if (!rol)
        throw new HttpError(400, "El rol seleccionado no existe");
    if (datos.oficina_id && !oficina)
        throw new HttpError(400, "La oficina seleccionada no existe");
    if (rol.nombre !== "Administrador" && !oficina)
        throw new HttpError(400, "La oficina es obligatoria para las cuentas no administradoras");
    if (rol.nombre === "Director(a)" && oficina?.nombre !== "Dirección")
        throw new HttpError(400, "Director(a) debe estar asignado a Dirección");
    if (rol.nombre === "Secretaria de Dirección" && oficina?.nombre !== "Mesa de Partes")
        throw new HttpError(400, "Secretaria de Dirección debe estar asignada a Mesa de Partes");
    return rol.nombre;
}
/** El bloqueo de escritura compartido hace segura esta regla incluso con dos peticiones simultáneas. */
async function protegerUltimo(usuario: repository.UsuarioAdministrado, siguienteRol: string, activo: boolean, cliente: PoolClient): Promise<void> {
    if (usuario.activo && usuario.rol === "Administrador" && (!activo || siguienteRol !== "Administrador")
        && await repository.administradoresActivos(cliente) <= 1) {
        throw new HttpError(409, "No se puede desactivar ni cambiar el rol del último Administrador activo");
    }
}
/**
 * Crea una cuenta administrada con asignaciones válidas y hash scrypt.
 * @param actor ID del administrador autenticado; se revalida dentro de la transacción.
 * @param datos Entrada ya validada por Zod, sin campos internos de autenticación.
 * @returns Proyección pública administrativa de la cuenta creada.
 */
export async function crear(actor: string, datos: CrearUsuario) {
    const hash = await generarHash(datos.contrasena);
    return escrituraAdministrativa(actor, /** Valida asignaciones y unicidad antes de insertar la cuenta con su hash ya derivado. */ async (cliente) => {
        await validarAsignaciones(datos, cliente);
        const duplicado = await repository.duplicado(datos, null, cliente);
        if (duplicado)
            throw new HttpError(409, duplicado);
        const id = await repository.crear(datos, hash, datos.activo, cliente);
        return detalle(id, cliente);
    });
}
/** Edita datos y asignaciones manteniendo el ID, la autoría y al menos un administrador activo. */
export async function editar(actor: string, id: string, datos: DatosUsuario) {
    return escrituraAdministrativa(actor, /** Protege al último administrador y valida asignaciones y duplicados antes de editar la cuenta. */ async (cliente) => {
        const actual = await detalle(id, cliente);
        const rol = await validarAsignaciones(datos, cliente);
        await protegerUltimo(actual, rol, actual.activo, cliente);
        const duplicado = await repository.duplicado(datos, id, cliente);
        if (duplicado)
            throw new HttpError(409, duplicado);
        await repository.editar(id, datos, cliente);
        return detalle(id, cliente);
    });
}
/** Cambia acceso sin borrar la cuenta; la versión impide reutilizar JWT anteriores tras reactivarla. */
export async function cambiarEstado(actor: string, id: string, activo: boolean) {
    return escrituraAdministrativa(actor, /** Comprueba la protección del último administrador y cambia la actividad con invalidación de JWT. */ async (cliente) => {
        const actual = await detalle(id, cliente);
        await protegerUltimo(actual, actual.rol, activo, cliente);
        await repository.cambiarEstado(id, activo, cliente);
        return detalle(id, cliente);
    });
}
/** Restablecimiento administrativo: nunca devuelve la contraseña o el hash, ni crea una cuenta pública. */
export async function restablecer(actor: string, id: string, contrasena: string): Promise<void> {
    const hash = await generarHash(contrasena);
    await escrituraAdministrativa(actor, /** Comprueba que la cuenta exista antes de sustituir su hash y revocar JWT previos. */ async (cliente) => {
        await detalle(id, cliente);
        await repository.cambiarContrasena(id, hash, cliente);
    });
}
