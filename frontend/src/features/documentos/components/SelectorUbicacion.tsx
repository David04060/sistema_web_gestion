import { useEffect, useId, useState } from 'react';
import { api, type UbicacionElegible } from '../../../api/documental';
import styles from '../../../components/ui/Admin.module.css';

function BuscadorUbicacion({
  token,
  valor,
  cambiar,
  opcional = false,
  deshabilitado = false,
  etiqueta,
  vacio,
  nivel,
  estanteId,
}: {
  token: string;
  valor: UbicacionElegible | null;
  cambiar: (ubicacion: UbicacionElegible | null) => void;
  opcional?: boolean;
  deshabilitado?: boolean;
  etiqueta: string;
  vacio: string;
  nivel?: 'estantes';
  estanteId?: string;
}) {
  const id = useId();
  const listaId = id + '-lista';
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [indice, setIndice] = useState(-1);
  const [apertura, setApertura] = useState(0);
  const q = texto.trim();
  const activo = abierto && !deshabilitado;
  const clave = JSON.stringify([token, q, apertura, nivel, estanteId]);
  const [respuesta, setRespuesta] = useState<{
    clave: string;
    datos?: Awaited<ReturnType<typeof api.buscarUbicaciones>>;
  }>();

  useEffect(() => {
    if (!activo) return;
    const control = new AbortController();
    const espera = setTimeout(() => {
      void api.buscarUbicaciones(token, q, control.signal, estanteId ? { estante_id: estanteId } : nivel ? { nivel } : undefined).then(
        (datos) => { if (!control.signal.aborted) setRespuesta({ clave, datos }); },
        () => { if (!control.signal.aborted) setRespuesta({ clave }); },
      );
    }, q ? 200 : 0);
    return () => { clearTimeout(espera); control.abort(); };
  }, [activo, clave, token, q, nivel, estanteId]);

  const actual = activo && respuesta?.clave === clave ? respuesta : undefined;
  const ubicaciones = actual?.datos?.ubicaciones ?? [];
  const opciones = !q && (opcional || valor)
    ? [{ id: '', ruta: vacio }, ...ubicaciones]
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
        {etiqueta}
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
          placeholder={estanteId ? 'Buscar archivador' : 'Buscar estante'}
          title={!activo ? valor?.ruta : undefined}
          value={activo ? texto : valor?.ruta ?? (opcional ? vacio : '')}
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
          <div id={listaId} role="listbox" aria-label={etiqueta + ' disponibles'}>
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

/** Selecciona únicamente opciones existentes; cambiar raíz elimina el contenido anterior. */
export function SelectorUbicacion({ token, valor, cambiar, opcional = false, deshabilitado = false }: {
  token: string;
  valor: UbicacionElegible | null;
  cambiar: (ubicacion: UbicacionElegible | null) => void;
  opcional?: boolean;
  deshabilitado?: boolean;
}) {
  const [seleccion, setSeleccion] = useState<{ token: string; estante: UbicacionElegible | null }>({ token, estante: null });
  const estante = valor && seleccion.token === token ? seleccion.estante : null;
  return (
    <div>
      <BuscadorUbicacion token={token} valor={estante} opcional={opcional} deshabilitado={deshabilitado}
        etiqueta={opcional ? 'Estante o lugar (opcional)' : 'Estante o lugar'} vacio="Sin ubicación" nivel="estantes"
        cambiar={nuevo => { setSeleccion({ token, estante: nuevo }); cambiar(nuevo); }} />
      {estante && (
        <>
          <BuscadorUbicacion key={estante.id} token={token} valor={valor?.id === estante.id ? null : valor}
            cambiar={contenido => cambiar(contenido ?? estante)} opcional deshabilitado={deshabilitado}
            etiqueta="Archivador o contenido (opcional)" vacio="Solo estante" estanteId={estante.id} />
          <p>Puedes guardar solo en el estante. La búsqueda filtra ubicaciones existentes de tu cuenta.</p>
        </>
      )}
    </div>
  );
}
