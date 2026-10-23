import { useCallback } from 'react';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import * as api from '../api/ubicaciones.api';
/** El listado solo necesita las dos colecciones autorizadas, no opciones de asignación. */
export function useUbicaciones() {
    const token = useAuth().sesion!.token;
    return useConsulta(useCallback(/** Consulta estantes y archivadores en paralelo sin descargar opciones de asignación innecesarias. */ async () => {
        const [estantes, archivadores] = await Promise.all([api.estantes(token), api.archivadores(token)]);
        return { ...estantes, ...archivadores };
    }, [token]));
}
/** El formulario de estante consulta exclusivamente sus opciones vigentes. */
export function useOpcionesUbicaciones() {
    const token = useAuth().sesion!.token;
    return useConsulta(useCallback(/** Consulta opciones de asignación únicamente para el formulario de estantes. */ () => api.opciones(token), [token]));
}
/** Crear/editar un archivador solo requiere el catálogo autorizado de estantes. */
export function useEstantesDisponibles() {
    const token = useAuth().sesion!.token;
    return useConsulta(useCallback(/** Consulta estantes disponibles sin descargar el catálogo de responsables. */ () => api.estantes(token), [token]));
}
