/** Archivo: Busca documentos autorizados para relacionarlos con un nuevo registro.
 */
import { useEffect, useId, useState } from 'react';
import { api } from '../../../api/documental';
type DocumentoElegible = { id: string; ruta: string };
import styles from '../../../components/ui/Admin.module.css';

export function SelectorDocumentoOrigen({
  token,
  valor,
  cambiar,
  opcional = false,
  deshabilitado = false,
}: {
  token: string;
  valor: DocumentoElegible | null;
  cambiar: (ubicacion: DocumentoElegible | null) => void;
  opcional?: boolean;
  deshabilitado?: boolean;
}) {
  const id = useId();
  const listaId = id + '-lista';
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [indice, setIndice] = useState(-1);
  const [apertura, setApertura] = useState(0);
  const q = texto.trim();
  const activo = abierto && !deshabilitado;
  const clave = JSON.stringify([token, q, apertura]);
  const [respuesta, setRespuesta] = useState<{
    clave: string;
    datos?: { documentos: DocumentoElegible[]; hay_mas: boolean };
  }>();

  useEffect(() => {
    if (!activo) return;
    const control = new AbortController();
    const espera = setTimeout(
      () => {
        void api
          .origenes(token, q, control.signal)
          .then((r) => ({
            documentos: r.documentos.map((d) => ({ id: d.id, ruta: d.codigo_visible + ' — ' + d.asunto })),
            hay_mas: r.hay_mas,
          }))
          .then(
            (datos) => {
              if (!control.signal.aborted) setRespuesta({ clave, datos });
            },
            () => {
              if (!control.signal.aborted) setRespuesta({ clave });
            },
          );
      },
      q ? 200 : 0,
    );
    return () => {
      clearTimeout(espera);
      control.abort();
    };
  }, [activo, clave, token, q]);

  const actual = activo && respuesta?.clave === clave ? respuesta : undefined;
  const documentos = actual?.datos?.documentos ?? [];
  const opciones =
    !q && (opcional || valor)
      ? [{ id: '', ruta: opcional ? 'Sin documento de origen' : 'Limpiar selección' }, ...documentos]
      : documentos;
  const opcionActiva = activo && opciones[indice] ? listaId + '-' + indice : undefined;
  useEffect(() => {
    if (opcionActiva) document.getElementById(opcionActiva)?.scrollIntoView({ block: 'nearest' });
  }, [opcionActiva]);

  function abrir() {
    if (activo) return;
    setApertura((n) => n + 1);
    setTexto('');
    setIndice(-1);
    setAbierto(true);
  }
  function elegir(opcion: DocumentoElegible) {
    cambiar(opcion.id ? opcion : null);
    setAbierto(false);
  }

  return (
    <div className={styles.selectorPersona}>
      <label className={styles.campo}>
        {opcional ? 'Documento de origen' : 'Documento de origen'}
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={activo}
          aria-controls={activo ? listaId : undefined}
          aria-activedescendant={opcionActiva}
          aria-required={!opcional}
          autoComplete="off"
          maxLength={250}
          placeholder="Buscar por código o asunto"
          title={!activo ? valor?.ruta : undefined}
          value={activo ? texto : (valor?.ruta ?? (opcional ? 'Sin documento de origen' : ''))}
          disabled={deshabilitado}
          onFocus={abrir}
          onClick={() => {
            abrir();
            if (actual && !actual.datos) setApertura((n) => n + 1);
          }}
          onBlur={() => setAbierto(false)}
          onChange={(e) => {
            setAbierto(true);
            setTexto(e.target.value);
            setIndice(-1);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Escape' && activo) {
              e.preventDefault();
              setAbierto(false);
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              abrir();
              if (activo && opciones.length)
                setIndice((i) =>
                  e.key === 'ArrowDown'
                    ? Math.min(i + 1, opciones.length - 1)
                    : i < 0
                      ? opciones.length - 1
                      : Math.max(i - 1, 0),
                );
            } else if (e.key === 'Enter' && activo) {
              e.preventDefault();
              if (opciones[indice]) elegir(opciones[indice]);
            }
          }}
        />
      </label>
      {activo && (
        <div className={styles.coincidenciasPersona}>
          <div id={listaId} role="listbox" aria-label="Documentos de origen disponibles">
            {opciones.map((opcion, i) => (
              <div
                key={opcion.id}
                id={listaId + '-' + i}
                role="option"
                aria-selected={i === indice}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => elegir(opcion)}
              >
                {opcion.ruta}
              </div>
            ))}
          </div>
          {!actual && <p role="status">Buscando documentos…</p>}
          {actual && !actual.datos && (
            <p role="alert">No se pudo buscar. Vuelve a escribir o pulsa el campo para reintentar.</p>
          )}
          {actual?.datos && !documentos.length && (
            <p role="status">{q ? 'No se encontraron documentos.' : 'No tienes documentos disponibles.'}</p>
          )}
          {actual?.datos?.hay_mas && (
            <p role="status">Hay más documentos. Escribe para acotar la búsqueda.</p>
          )}
        </div>
      )}
    </div>
  );
}
