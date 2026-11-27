/** Archivo: Conecta las consultas con React y descarta resultados de una cuenta, permiso o filtro anterior.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../features/auth/hooks/useAuth';
import { Consulta } from './consulta';
/** Separa primera carga y actualización; descarta resultados de otra cuenta, permiso o filtro.
 * @param consultar Callback estable que obtiene los datos y rechaza errores de transporte.
 * @param opciones Controla habilitación y conservación de resultados de una consulta restringida.
 * @returns Datos vigentes, estados de carga/error y recarga; la limpieza invalida respuestas tardías. */
export function useConsulta<T>(
  consultar: () => Promise<T>,
  opciones: { restringida?: boolean; habilitada?: boolean } = {},
) {
  const { sesion, revisionAcceso } = useAuth();
  const contexto = JSON.stringify([sesion?.token, sesion?.usuario, revisionAcceso]);
  const restringida = opciones.restringida ?? false;
  const habilitada = opciones.habilitada ?? true;
  const [consulta] = useState(() => new Consulta<T>());
  const [estado, setEstado] = useState(consulta.snapshot);
  const [revision, setRevision] = useState(0);
  const recargar = useCallback(() => {
    if (!consulta.snapshot.pendiente) setRevision((valor) => valor + 1);
  }, [consulta]);
  useEffect(() => {
    const desuscribir = consulta.subscribe(setEstado);
    if (habilitada) void consulta.ejecutar(consultar, contexto, !restringida);
    else consulta.limpiar();
    return () => {
      desuscribir();
      consulta.cancelar();
    };
  }, [consulta, consultar, contexto, restringida, habilitada, revision]);
  // Evita incluso un render con datos de otra cuenta, filtro o perfil antes del efecto.
  const vigente = habilitada && estado.consultar === consultar && estado.contexto === contexto;
  return {
    datos: vigente ? estado.datos : null,
    cargando: !vigente || (estado.pendiente && estado.datos === null),
    actualizando: vigente && estado.pendiente && estado.datos !== null,
    error: vigente ? estado.error : '',
    recargar,
  };
}
