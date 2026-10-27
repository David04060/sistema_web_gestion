import { useCallback } from 'react';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { api as oficinasApi } from '../../oficinas/api/oficinas.api';
import { listar } from '../../usuarios/api/usuarios.api';
import type { UsuarioAdministrado } from '../../usuarios/schemas/usuarios.schema';
import type { RegistroCatalogo } from '../../../lib/catalogo.schema';

/** Recorre el catálogo administrativo paginado; nunca consulta documentos. */
async function usuariosCatalogo(token: string) {
    const usuarios: UsuarioAdministrado[] = [];
    for (let pagina = 1; ; pagina++) {
        const respuesta = await listar(token, new URLSearchParams({ pagina: String(pagina), limite: '100' }).toString());
        usuarios.push(...respuesta.usuarios);
        if (usuarios.length >= respuesta.total) return usuarios;
        if (!respuesta.usuarios.length) throw new Error('El catálogo de responsables cambió. Vuelve a cargarlo.');
    }
}
/** La compatibilidad visual replica las reglas de selección; el servidor decide al guardar. */
export function responsableCompatible(u: UsuarioAdministrado, oficina?: RegistroCatalogo) {
    return !!oficina && u.activo && u.oficina_id === oficina.id &&
        (u.rol !== 'Director(a)' || oficina.nombre === 'Dirección') &&
        (u.rol !== 'Secretaria de Dirección' || oficina.nombre === 'Mesa de Partes');
}
export function useCatalogosArchivos() {
    const token = useAuth().sesion!.token;
    return useConsulta(useCallback(async () => {
        const [oficinas, usuarios] = await Promise.all([oficinasApi.listar(token), usuariosCatalogo(token)]);
        return { oficinas, usuarios };
    }, [token]));
}
