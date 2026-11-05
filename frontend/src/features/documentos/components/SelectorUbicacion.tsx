import { useEffect, useId, useState } from 'react';
import { api, type UbicacionElegible } from '../../../api/documental';
import styles from '../../../components/ui/Admin.module.css';

export function SelectorUbicacion({
  token,
  valor,
  cambiar,
  opcional = false,
  deshabilitado = false,
}: {
  token: string;
  valor: UbicacionElegible | null;
  cambiar: (ubicacion: UbicacionElegible | null) => void;
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
    datos?: Awaited<ReturnType<typeof api.buscarUbicaciones>>;
  }>();

  useEffect(() => {
    if (!activo) return;
    const control = new AbortController();
    const espera = setTimeout(() => {
      void api.buscarUbicaciones(token, q, control.signal).then(
        (datos) => { if (!control.signal.aborted) setRespuesta({ clave, datos }); },
        () => { if (!control.signal.aborted) setRespuesta({ clave }); },
      );
    }, q ? 200 : 0);
    return () => { clearTimeout(espera); control.abort(); };
  }, [activo, clave, token, q]);

  const actual = activo && respuesta?.clave === clave ? respuesta : undefined;
  const ubicaciones = actual?.datos?.ubicaciones ?? [];
  const opciones = !q && (opcional || valor)
    ? [{ id: '', ruta: opcional ? 'Sin ubicación' : 'Limpiar selección' }, ...ubicaciones]
    : ubicaciones;
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
  function elegir(opcion: UbicacionElegible) {
    cambiar(opcion.id ? opcion : null);
    setAbierto(false);
  }

  return (
    <div className={styles.selectorPersona}>
      <label className={styles.campo}>
        {opcional ? 'Ubicación opcional' : 'Ubicación física'}
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
          placeholder="Buscar estante o archivador"
          title={!activo ? valor?.ruta : undefined}
          value={activo ? texto : valor?.ruta ?? (opcional ? 'Sin ubicación' : '')}
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
                setIndice((i) => e.key === 'ArrowDown'
                  ? Math.min(i + 1, opciones.length - 1)
                  : i < 0 ? opciones.length - 1 : Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && activo) {
              e.preventDefault();
              if (opciones[indice]) elegir(opciones[indice]);
            }
          }}
        />
      </label>
      {activo && (
        <div className={styles.coincidenciasPersona}>
          <div id={listaId} role="listbox" aria-label="Ubicaciones disponibles">
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
          {!actual && <p role="status">Buscando ubicaciones…</p>}
          {actual && !actual.datos && (
            <p role="alert">No se pudo buscar. Vuelve a escribir o pulsa el campo para reintentar.</p>
          )}
          {actual?.datos && !ubicaciones.length && (
            <p role="status">
              {q ? 'No se encontraron ubicaciones.' : 'No tienes ubicaciones disponibles.'}
            </p>
          )}
          {actual?.datos?.hay_mas && (
            <p role="status">Hay más ubicaciones. Escribe para acotar la búsqueda.</p>
          )}
        </div>
      )}
    </div>
  );
}
