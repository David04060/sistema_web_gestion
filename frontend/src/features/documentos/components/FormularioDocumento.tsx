import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  api,
  rutaUnidades,
  type DocumentoActual,
  type OpcionesActuales,
} from '../../../api/documental';
import { DestinoDocumental, datosDestino, destinoVacio } from './DestinoDocumental';
import { ArchivoPdf } from './ArchivoPdf';
import { clientePdf, comprobarSeleccion, subirPdf } from '../api/pdf.api';
import styles from '../../../components/ui/Admin.module.css';
import { PrevisualizacionRegistroPdf } from '../components/PrevisualizacionRegistroPdf';

/** Guarda primero el registro; la carga PDF es posterior y sus fallos no duplican el documento. */
export function FormularioDocumento({
  token,
  perfil,
  id,
  opciones,
  inicial,
  origen,
  clasificacion,
}: {
  token: string;
  perfil: {
    rol: string;
    oficina_id: string | null;
  };
  id?: string;
  opciones: OpcionesActuales;
  inicial: DocumentoActual | null;
  origen: DocumentoActual | null;
  clasificacion: 'RECIBIDO' | 'EMITIDO';
}) {
  const navegar = useNavigate();
  const enviando = useRef(false);
  const [delegar, setDelegar] = useState(false);
  const [destino, setDestino] = useState(destinoVacio);
  const [datos, setDatos] = useState({
    tipo_id: inicial?.tipo_id ?? '',
    clasificacion: inicial?.clasificacion ?? clasificacion,
    asunto: inicial?.asunto ?? '',
    remitente: inicial?.remitente ?? '',
    observaciones: inicial?.observaciones ?? '',
    unidad_id: '',
    conservar_en_mesa: false,
    motivo: '',
  });
  const campos = inicial
    ? inicial.valores.map((v) => ({ id: v.campo_id, nombre_actual: v.nombre_guardado }))
    : opciones.campos;
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(inicial?.valores.map((v) => [v.campo_id, v.valor]) ?? []),
  );
  const [pdf, setPdf] = useState<{
      archivo: File;
      bytes: Uint8Array;
    }>(),
    [ocupado, setOcupado] = useState(false),
    [error, setError] = useState(''),
    [creado, setCreado] = useState<string>();
  const cambiar = (k: keyof typeof datos, v: string | boolean) =>
    setDatos((d) => ({ ...d, [k]: v }));
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando.current) return;
    enviando.current = true;
    setOcupado(true);
    setError('');
    try {
      const contenido = {
        asunto: datos.asunto.trim(),
        remitente: datos.remitente.trim() || null,
        observaciones: datos.observaciones.trim() || null,
        valores: campos
          .filter((c) => id || valores[c.id]?.trim())
          .map((c) => ({ campo_id: c.id, valor: valores[c.id] ?? '' })),
      };
      const resultado =
        id && inicial
          ? await api.corregir(token, id, {
              ...contenido,
              revision: inicial.revision,
              motivo: datos.motivo.trim(),
            })
          : await api.registrar(token, {
              ...contenido,
              tipo_id: datos.tipo_id,
              ...(delegar ? { destino: datosDestino(destino) } : {}),
              clasificacion: datos.clasificacion,
              conservar_en_mesa: conservarEnMesa,
              ...(ubicable && datos.unidad_id ? { unidad_id: datos.unidad_id } : {}),
              ...(origen ? { origen_id: origen.id } : {}),
            });
      if (!id) {
        setCreado(resultado.documento.id);
        if (pdf) await subirPdf(clientePdf(token, resultado.documento.id), pdf.archivo, null);
      }
      navegar('/documentos/' + resultado.documento.id, {
        replace: true,
        state: { mensaje: id ? 'Datos corregidos.' : 'Documento registrado.' },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      enviando.current = false;
      setOcupado(false);
    }
  }
  if (creado && ocupado && !error)
    return (
      <section className={styles.tarjeta} role="status">
        <h2>Documento registrado</h2>
        <p>Confirmando el PDF adjunto…</p>
      </section>
    );
  if (creado)
    return (
      <>
        <section className={styles.tarjeta}>
          <h2>El documento ya está registrado</h2>
          <p role="alert">{error || 'El registro se conservó.'}</p>
          <p>Si falló el PDF, puedes adjuntarlo aquí sin registrar el documento otra vez.</p>
          <Link to={'/documentos/' + creado}>Abrir documento</Link>
        </section>
        <ArchivoPdf token={token} id={creado} />
      </>
    );
  const conservarEnMesa = perfil.rol === 'Secretaria de Dirección' && (delegar || datos.conservar_en_mesa);
  const ubicable =
    !(delegar && perfil.rol === 'Director(a)') &&
    !!perfil.oficina_id &&
    (perfil.rol === 'Usuario' ||
      (conservarEnMesa) ||
      perfil.rol === 'Director(a)');
  return (
    <>
      <section className={styles.tarjeta}>
        {origen && (
          <p>
            Documento de origen:{' '}
            <Link to={'/documentos/' + origen.id}>{origen.codigo_visible}</Link>
          </p>
        )}
        <form onSubmit={(e) => void guardar(e)}>
          <div className={styles.formularioDosColumnas}>
            {!id && (
              <>
                <label className={styles.campo}>
                  Clasificación
                  <select
                    value={datos.clasificacion}
                    onChange={(e) => cambiar('clasificacion', e.target.value)}
                  >
                    <option value="RECIBIDO">Recibido</option>
                    <option value="EMITIDO">Emitido</option>
                  </select>
                </label>
                <label className={styles.campo}>
                  Tipo documental
                  <select
                    required
                    value={datos.tipo_id}
                    onChange={(e) => cambiar('tipo_id', e.target.value)}
                  >
                    <option value="">Seleccionar tipo</option>
                    {opciones.tipos.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre} ({t.prefijo})
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label className={`${styles.campo} ${styles.campoCompleto}`}>
              Asunto
              <textarea
                required
                maxLength={20000}
                value={datos.asunto}
                onChange={(e) => cambiar('asunto', e.target.value)}
              />
            </label>
            <label className={styles.campo}>
              Remitente opcional
              <input
                maxLength={250}
                value={datos.remitente}
                onChange={(e) => cambiar('remitente', e.target.value)}
              />
            </label>
            <label className={`${styles.campo} ${styles.campoCompleto}`}>
              Observaciones opcionales
              <textarea
                maxLength={20000}
                value={datos.observaciones}
                onChange={(e) => cambiar('observaciones', e.target.value)}
              />
            </label>
            {!id && perfil.rol === 'Secretaria de Dirección' && (
              <label className={styles.campo}>
                Destino inicial
                <select
                  disabled={delegar}
                  value={conservarEnMesa ? 'mesa' : 'direccion'}
                  onChange={(e) => {
                    cambiar('conservar_en_mesa', e.target.value === 'mesa');
                    cambiar('unidad_id', '');
                  }}
                >
                  <option value="direccion">Pendiente de decisión de Dirección</option>
                  <option value="mesa">Conservar en Mesa de Partes</option>
                </select>
              </label>
            )}
            {!id && ubicable && (
              <label className={styles.campo}>
                Ubicación opcional
                <select
                  value={datos.unidad_id}
                  onChange={(e) => cambiar('unidad_id', e.target.value)}
                >
                  <option value="">Sin ubicación</option>
                  {opciones.unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {rutaUnidades(opciones.unidades, u.id)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!id && (
              <details onToggle={(e) => setDelegar(e.currentTarget.open)}>
                <summary>Delegar</summary>
                {delegar && (
                  <DestinoDocumental token={token} valor={destino} cambiar={setDestino} opciones={opciones} />
                )}
              </details>
            )}
            {campos.map((c) => (
              <label key={c.id} className={styles.campo}>
                {c.nombre_actual}
                <textarea
                  maxLength={20000}
                  value={valores[c.id] ?? ''}
                  onChange={(e) => setValores((v) => ({ ...v, [c.id]: e.target.value }))}
                />
              </label>
            ))}
            {id && (
              <label className={`${styles.campo} ${styles.campoCompleto}`}>
                Motivo de corrección
                <textarea
                  required
                  maxLength={1000}
                  value={datos.motivo}
                  onChange={(e) => cambiar('motivo', e.target.value)}
                />
              </label>
            )}
          </div>
          {!id && !opciones.tipos.length && (
            <p>
              Primero añade un <Link to="/tipos-documentales">tipo documental en tu ámbito</Link>.
            </p>
          )}
          {!id && (
            <section className={styles.seccionPdf} aria-label="PDF opcional">
              <h2>PDF opcional</h2>
              <label className={styles.campo}>
                PDF opcional (máximo 15 MiB)
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={ocupado}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    setError('');
                    void Promise.resolve()
                      .then(async () => {
                        comprobarSeleccion(f);
                        setPdf({ archivo: f, bytes: new Uint8Array(await f.arrayBuffer()) });
                      })
                      .catch((e) => setError(e instanceof Error ? e.message : 'PDF inválido'));
                  }}
                />
              </label>
              {pdf && (
                <PrevisualizacionRegistroPdf
                  archivo={pdf.archivo}
                  bytes={pdf.bytes}
                  ocupado={ocupado}
                  quitar={() => setPdf(undefined)}
                />
              )}
            </section>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.acciones}>
            <button className={styles.boton} disabled={ocupado || (!id && !opciones.tipos.length)}>
              {ocupado
                ? 'Guardando…'
                : id
                  ? 'Guardar corrección'
                  : 'Registrar documento'}
            </button>
            <Link className={styles.secundario} to={id ? '/documentos/' + id : '/documentos'}>
              Cancelar
            </Link>
          </div>
        </form>
      </section>
    </>
  );
}
