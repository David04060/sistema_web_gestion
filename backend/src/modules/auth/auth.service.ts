import { buscarPorIdentificador, buscarPorId, } from "./auth.repository.js";
import { verificarContrasena } from "../../shared/security/password.js";
import { generarToken, verificarToken, TOKEN_DURACION_SEGUNDOS } from "../../shared/security/jwt.js";
import type { LoginInput } from "./auth.schema.js";
import type { LoginRespuesta, UsuarioAuth } from "./auth.types.js";
import { usuarioPublico } from "./auth.mapper.js";
/** Verifica credenciales sin distinguir públicamente cuenta ausente, inactiva o contraseña errónea. */
export async function iniciarSesion(datos: LoginInput): Promise<LoginRespuesta | null> {
    const usuario = await buscarPorIdentificador(datos.identificador);
    // Siempre comprobar una contraseña, incluso si la cuenta no existe.
    const hashFicticio = "scrypt$16384$8$1$" +
        "00000000000000000000000000000000$" +
        "0".repeat(128);
    const contrasenaCorrecta = await verificarContrasena(datos.contrasena, usuario?.contrasena_hash ?? hashFicticio);
    if (!usuario ||
        !usuario.activo ||
        !contrasenaCorrecta) {
        return null;
    }
    return {
        token: generarToken(usuario.id, usuario.version_autenticacion),
        tipo: "Bearer",
        expiresIn: TOKEN_DURACION_SEGUNDOS,
        usuario: usuarioPublico(usuario),
    };
}
/** Reconsulta actividad y versión: el JWT por sí solo no concede acceso al usuario. */
export async function autenticarToken(token: string): Promise<UsuarioAuth> {
    const payload = verificarToken(token);
    const usuario = await buscarPorId(payload.sub);
    if (!usuario ||
        !usuario.activo ||
        usuario.version_autenticacion !== payload.version) {
        throw new Error("TOKEN_NO_VALIDO");
    }
    return usuario;
}
