import { useCallback, useState } from 'react';
import { useParams,useSearchParams } from 'react-router-dom';
import { api } from '../../../api/documental';
import styles from '../../../components/ui/Admin.module.css';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { useConsulta } from '../../../hooks/useConsulta';
import { useAuth } from '../../auth/hooks/useAuth';
import { SelectorDocumentoOrigen } from '../components/SelectorDocumentoOrigen';
import { FormularioDocumento } from '../components/FormularioDocumento';
export function DocumentoFormularioPage() {
  const { id } = useParams(),
    [params,setParams] = useSearchParams(),
    { token, usuario } = useAuth().sesion!;
  const [modoRelacionado,setModoRelacionado]=useState(false);
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
      {!id && <section className={styles.modalidadRegistro} aria-label="Modalidad de registro">
        <label className={styles.opcionRelacionada}>Registrar documento relacionado<input type="checkbox" checked={modoRelacionado || !!origen} onChange={e=>{setModoRelacionado(e.target.checked);if(!e.target.checked){const q=new URLSearchParams(params);q.delete('origen');setParams(q);}}}/></label>
        {(modoRelacionado || !!origen) && <SelectorDocumentoOrigen token={token} valor={consulta.datos?.origen?{id:consulta.datos.origen.id,ruta:consulta.datos.origen.codigo_visible+' — '+consulta.datos.origen.asunto}:null} cambiar={d=>{const q=new URLSearchParams(params);if(d)q.set('origen',d.id);else q.delete('origen');setParams(q);}}/>}
        {modoRelacionado && !origen && <p>Selecciona el documento de origen para continuar con el registro.</p>}
      </section>}
      <EstadoCarga {...consulta} tipo="detalle" reintentar={consulta.recargar} />
      {consulta.datos && (!modoRelacionado || !!origen || !!id) &&
        (id && !consulta.datos.detalle?.permisos.corregir ? (
          <p role="alert">No tienes permiso para corregir este documento.</p>
        ) : consulta.datos.origen && !consulta.datos.origen.permisos.relacionar ? (
          <p role="alert">No puedes registrar un documento relacionado en ese ámbito.</p>
        ) : (
          <FormularioDocumento
            key={id ?? ('nuevo-'+(origen??''))}
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
