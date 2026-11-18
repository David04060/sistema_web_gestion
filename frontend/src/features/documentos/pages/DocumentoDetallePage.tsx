import { GrupoDocumental } from '../components/GrupoDocumental';
import { useCallback,useState } from 'react';
import { Link,useLocation,useParams } from 'react-router-dom';
import { api,etiquetas,type DocumentoActual } from '../../../api/documental';
import styles from '../../../components/ui/Admin.module.css';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { useConsulta } from '../../../hooks/useConsulta';
import { fechaLocal } from '../../../lib/fechas';
import { useAuth } from '../../auth/hooks/useAuth';
import { AccionesDocumento } from '../components/AccionesDocumento';
import { ArchivoPdf } from '../components/ArchivoPdf';
import { AuditoriaDocumento } from '../components/AuditoriaDocumento';
import { HistorialDocumento } from '../components/HistorialDocumento';
/** Una respuesta anterior nunca reemplaza una mutación confirmada de revisión más reciente. */
export function DocumentoDetallePage() {
  const { id = '' } = useParams(),
    { token } = useAuth().sesion!;
  const navegacion = useLocation(),
    mensajeRuta = (navegacion.state as { mensaje?: unknown } | null)?.mensaje;
  const consulta = useConsulta(
    useCallback(
      async () => {
        const detalle = await api.detalle(token, id);
        const historial = detalle.documento.delegado_por_nombre
          ? undefined
          : await api.historial(token, id);
        return { detalle, historial };
      },
      [token, id],
    ),
  );
  const [confirmado, setConfirmado] = useState<{
    contexto: string;
    documento: DocumentoActual;
    mensaje: string;
  }>();
  const [revisionAuditoria, setRevisionAuditoria] = useState(0);
  const contexto = token + ':' + id;
  const base = consulta.datos?.detalle.documento;
  const vigente = confirmado?.contexto === contexto ? confirmado : undefined;
  const d =
    base && vigente && BigInt(vigente.documento.revision) >= BigInt(base.revision)
      ? vigente.documento
      : base;
  function actualizar(documento: DocumentoActual, mensaje: string) {
    setConfirmado({ contexto, documento, mensaje });
    consulta.recargar();
  }
  return (
    <main className={styles.pagina}>
      <h1>Documento</h1>
      {typeof mensajeRuta === 'string' && !vigente && (
        <p className={styles.exito} role="status">
          {mensajeRuta}
        </p>
      )}
      {vigente && (
        <p className={styles.exito} role="status">
          {vigente.mensaje}
        </p>
      )}
      <EstadoCarga {...consulta} tipo="detalle" reintentar={consulta.recargar} />
      {d && (
        <>
          <section className={styles.tarjeta}>
            <h2>{d.codigo_visible}</h2>
            <p>{d.asunto}</p>
            {d.historico_solo_lectura && <p className={styles.aviso}>Archivo de un periodo anterior: consulta de solo lectura. Se conservan su registrador, ubicación e historial originales.</p>}
            <dl className={styles.datos}>
              <div>
                <dt>Registrado por</dt>
                <dd>{d.registrado_por_nombre}</dd>
              </div>
              <div>
                <dt>Clasificación</dt>
                <dd>
                  {d.clasificacion === 'RECIBIDO'
                    ? 'Recibido'
                    : d.clasificacion === 'EMITIDO'
                      ? 'Emitido'
                      : 'Sin clasificar'}
                </dd>
              </div>
              <div>
                <dt>Tipo registrado</dt>
                <dd>{d.tipo_nombre_guardado}</dd>
              </div>
              <div>
                <dt>Situación</dt>
                <dd>{etiquetas[d.situacion_cuenta ?? d.situacion]}</dd>
              </div>
              <div>
                <dt>Fecha de registro</dt>
                <dd>{fechaLocal(d.creado_en)}</dd>
              </div>
              <div>
                <dt>Remitente</dt>
                <dd>{d.remitente || '—'}</dd>
              </div>
              <div>
                <dt>Observaciones</dt>
                <dd>{d.observaciones || '—'}</dd>
              </div>
              <div>
                <dt>Ubicación registrada</dt>
                <dd>
                  {d.ubicacion
                    ? d.ubicacion.oficina_nombre_guardado +
                      ' / ' +
                      d.ubicacion.ruta_ubicacion_guardada
                    : 'Sin ubicación registrada'}
                </dd>
              </div>
              {d.delegacion && (
                <>
                  <div>
                    <dt>Delegado a</dt>
                    <dd>{d.delegacion.nombre_persona_guardado}</dd>
                  </div>
                  <div>
                    <dt>Delegado por</dt>
                    <dd>{d.delegacion.actor}</dd>
                  </div>
                  <div>
                    <dt>Fecha de delegación</dt>
                    <dd>{fechaLocal(d.delegacion.delegado_en)}</dd>
                  </div>
                  {d.delegacion.observaciones && (
                    <div>
                      <dt>Observaciones de delegación</dt>
                      <dd>{d.delegacion.observaciones}</dd>
                    </div>
                  )}
                </>
              )}
              {d.valores.map((v) => (
                <div key={v.campo_id}>
                  <dt>{v.nombre_guardado}</dt>
                  <dd>{v.valor || '—'}</dd>
                </div>
              ))}
            </dl>
            <div className={styles.acciones}>
              {d.permisos.corregir && (
                <Link className={styles.boton} to={'/documentos/' + d.id + '/editar'}>
                  Corregir datos
                </Link>
              )}
              {d.permisos.relacionar && (
                <Link className={styles.secundario} to={'/documentos/nuevo?origen=' + d.id}>
                  Registrar documento relacionado
                </Link>
              )}
              <Link className={styles.secundario} to="/documentos">
                Volver al listado
              </Link>
            </div>
          </section>
          <ArchivoPdf
            key={'pdf-' + d.id + '-' + d.revision}
            token={token}
            id={d.id}
            alCambiar={() => {
              setRevisionAuditoria((v) => v + 1);
              consulta.recargar();
            }}
          />
          {(d.permisos.delegar || d.permisos.ubicar || d.permisos.anular) && (
            <AccionesDocumento
              key={'acciones-' + d.id + '-' + d.revision}
              token={token}
              documento={d}
              actualizar={actualizar}
            />
          )}
          <GrupoDocumental documento={d} />
          {!d.delegado_por_nombre && <HistorialDocumento historial={consulta.datos?.historial?.historial ?? []} />}
          {!d.delegado_por_nombre && <AuditoriaDocumento
            key={'auditoria-' + d.id}
            token={token}
            id={d.id}
            revision={d.revision + ':' + revisionAuditoria}
          />}
        </>
      )}
    </main>
  );
}
