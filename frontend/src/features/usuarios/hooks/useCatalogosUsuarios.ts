import { useCallback } from 'react';
import { useAuth } from '../../auth/hooks/useAuth';
import { api as rolesApi } from '../../roles/api/roles.api';
import { api as oficinasApi } from '../../oficinas/api/oficinas.api';
import { useConsulta } from '../../../hooks/useConsulta';
/** Las opciones de asignación son datos reales; nunca se mantienen catálogos estáticos en React. */
export function useCatalogosUsuarios() {
    const token = useAuth().sesion!.token;
    const consultar = useCallback(/** Consulta roles y oficinas en paralelo para construir las asignaciones del formulario. */ async () => {
        const [roles, oficinas] = await Promise.all([rolesApi.listar(token), oficinasApi.listar(token)]);
        return { roles, oficinas };
    }, [token]);
    return useConsulta(consultar);
}
