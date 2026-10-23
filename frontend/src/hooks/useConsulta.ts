import { useCallback, useEffect, useRef, useState } from 'react';
/** Ejecuta una consulta explícita y descarta respuestas antiguas al cambiar filtros, token o desmontar. */
export function useConsulta<T>(consultar: () => Promise<T>) {
    const [datos, setDatos] = useState<T | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const vigente = useRef(0);
    const recargar = useCallback(/** Solicita una nueva ejecución de la consulta aumentando su revisión. */ () => setRevision(/** Incrementa la revisión desde su valor anterior para no perder recargas concurrentes. */  valor => valor + 1), []);
    useEffect(/** Inicia una versión de consulta, limpia datos previos y prepara el descarte de respuestas obsoletas. */ () => {
        const version = ++vigente.current;
        setCargando(true);
        setError('');
        setDatos(null);
        void consultar().then(/** Publica datos solo si la respuesta pertenece a la consulta todavía vigente. */  resultado => {
            if (version === vigente.current)
                setDatos(resultado);
        }).catch(/** Presenta el fallo solo si corresponde a la consulta vigente. */ (fallo: unknown) => {
            if (version === vigente.current)
                setError(fallo instanceof Error ? fallo.message : 'No se pudo consultar la información.');
        }).finally(/** Finaliza la carga solo si esta operación sigue siendo la vigente. */ () => {
            if (version === vigente.current)
                setCargando(false);
        });
        return /** Invalida respuestas pendientes al cambiar dependencias o desmontar el consumidor. */ () => {
            vigente.current++;
        };
    }, [consultar, revision]);
    return { datos, cargando, error, recargar };
}
