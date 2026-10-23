/** Modelo interno del repositorio. El hash y la versión nunca se serializan al cliente. */
export interface UsuarioAuth {
    id: string;
    nombre: string;
    apellido: string;
    nombre_usuario: string;
    email: string | null;
    contrasena_hash: string;
    activo: boolean;
    rol: string;
    oficina: string | null;
    version_autenticacion: number;
}
export type UsuarioPublico = Omit<UsuarioAuth, "contrasena_hash" | "activo" | "version_autenticacion">;
export interface LoginRespuesta {
    token: string;
    tipo: "Bearer";
    expiresIn: number;
    usuario: UsuarioPublico;
}
