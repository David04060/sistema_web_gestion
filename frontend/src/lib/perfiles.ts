export const perfiles = ['Superadministrador', 'Administrador', 'Director(a)', 'Secretaria de Dirección', 'Usuario'] as const;
export const rolesDocumentales = ['Superadministrador', 'Director(a)', 'Secretaria de Dirección', 'Usuario'];
export const rolesRegistro = ['Director(a)', 'Secretaria de Dirección', 'Usuario'];
export const rolesAdministracion = ['Superadministrador', 'Administrador'];
export function esAdministracion(rol: string) { return rolesAdministracion.includes(rol); }
export function enlacesPerfil(rol: string, oficina: string | null) {
    const enlaces = [{ ruta: '/dashboard', titulo: 'Inicio', icono: 'panel' as const }];
    const resultado: Array<{
        ruta: string;
        titulo: string;
        icono: 'panel' | 'documentos' | 'tipos' | 'ubicaciones' | 'usuarios' | 'roles' | 'oficinas';
    }> = [...enlaces];
    if (rolesDocumentales.includes(rol))
        resultado.push({ ruta: '/documentos', titulo: 'Documentos', icono: 'documentos' });
    if (rolesRegistro.includes(rol))
        resultado.push({ ruta: '/tipos-documentales', titulo: 'Tipos documentales', icono: 'tipos' });
    if (esAdministracion(rol) || oficina)
        resultado.push({ ruta: '/ubicaciones', titulo: esAdministracion(rol) ? 'Ubicaciones por cuenta' : 'Mis ubicaciones', icono: 'ubicaciones' });
    if (esAdministracion(rol))
        resultado.push({ ruta: '/usuarios', titulo: 'Usuarios', icono: 'usuarios' }, { ruta: '/oficinas', titulo: 'Oficinas', icono: 'oficinas' }, { ruta: '/campos-opcionales', titulo: 'Campos opcionales', icono: 'tipos' }, { ruta: '/roles', titulo: 'Roles', icono: 'roles' });
    return resultado;
}
