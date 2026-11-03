import type { UsuarioAuth, UsuarioPublico } from './auth.types.js';
/** Lista explícita de campos públicos; evita exponer nuevas columnas internas por accidente. */
export function usuarioPublico(usuario: UsuarioAuth): UsuarioPublico {
  return {
    id: usuario.id,
    ...(usuario.rol_id === undefined
      ? {}
      : { rol_id: usuario.rol_id, oficina_id: usuario.oficina_id, ambito_id: usuario.ambito_id }),
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    nombre_usuario: usuario.nombre_usuario,
    email: usuario.email,
    rol: usuario.rol,
    oficina: usuario.oficina,
  };
}
