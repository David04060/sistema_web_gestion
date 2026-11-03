import { useCallback } from 'react';
import { useParams,useSearchParams } from 'react-router-dom';
import { api } from '../../../api/documental';
import styles from '../../../components/ui/Admin.module.css';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { useConsulta } from '../../../hooks/useConsulta';
import { useAuth } from '../../auth/hooks/useAuth';
import { FormularioDocumento } from '../components/FormularioDocumento';
export function DocumentoFormularioPage() {
  const { id } = useParams(),
    [params] = useSearchParams(),
    { token, usuario } = useAuth().sesion!;
  const origen = params.get('origen') ?? undefined,
    clasificacion = params.get('clasificacion');
  const consulta = useConsulta(
    useCallback(
      async () => ({
        opciones: await api.opciones(token),
        detalle: id ? (await api.detalle(token, id)).documento : null,
        origen: origen ? (await api.detalle(token, origen)).documento : null,
      }),
      [token, id, origen],
    ),
  );
  return (
    <main className={styles.pagina}>
      <h1>{id ? 'Corregir documento' : 'Registrar documento'}</h1>
      <EstadoCarga {...consulta} tipo="detalle" reintentar={consulta.recargar} />
      {consulta.datos &&
        (id && !consulta.datos.detalle?.permisos.corregir ? (
          <p role="alert">No tienes permiso para corregir este documento.</p>
        ) : consulta.datos.origen && !consulta.datos.origen.permisos.relacionar ? (
          <p role="alert">No puedes registrar un documento relacionado en ese ámbito.</p>
        ) : (
          <FormularioDocumento
            key={id ?? 'nuevo'}
            token={token}
            perfil={usuario}
            id={id}
            opciones={consulta.datos.opciones}
            inicial={consulta.datos.detalle}
            origen={consulta.datos.origen}
            clasificacion={clasificacion === 'EMITIDO' ? 'EMITIDO' : 'RECIBIDO'}
          />
        ))}
    </main>
  );
}
