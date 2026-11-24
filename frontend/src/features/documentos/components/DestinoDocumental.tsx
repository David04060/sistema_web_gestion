import { useEffect, useId, useState } from 'react';
import { api } from '../../../api/documental';
import type { OpcionesActuales } from '../../../api/documental';
import styles from '../../../components/ui/Admin.module.css';
export const destinoVacio = {
  modo: 'usuario',
  oficina: '',
  usuario: '',
  etiqueta: '',
  nombre: '',
  observaciones: '',
};
export type Destino = typeof destinoVacio;
export function datosDestino(v: Destino) {
  if (v.modo === 'usuario' && !v.usuario) throw Error('Selecciona una persona registrada.');
  if (v.modo === 'manual' && !v.nombre.trim()) throw Error('Escribe el nombre de la persona.');
  return {
    oficina_id: v.modo === 'usuario' ? v.oficina || null : null,
    usuario_id: v.modo === 'usuario' ? v.usuario : null,
    nombre: v.modo === 'manual' ? v.nombre.trim() : null,
    observaciones: v.observaciones.trim() || null,
  };
}
export function DestinoDocumental({
  valor: v,
  cambiar,
  opciones,
  token,
}: {
  valor: Destino;
  cambiar: (d: Destino) => void;
  opciones: OpcionesActuales;
  token: string;
}) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [indice, setIndice] = useState(-1);
  const listaId = useId();
  const [intento, setIntento] = useState(0);
  const consulta = texto.trim();
  const activa = abierto && !v.usuario && v.modo === 'usuario';
  const clave = JSON.stringify([token, consulta, v.oficina, intento]);
  const [resultado, setResultado] = useState<{
    clave: string;
    datos?: Awaited<ReturnType<typeof api.destinatarios>>;
    error?: string;
  }>();
  useEffect(() => {
    if (!activa) return;
    const control = new AbortController();
    const espera = setTimeout(() => {
      void api.destinatarios(token, consulta, v.oficina, control.signal).then(
        (datos) => { if (!control.signal.aborted) setResultado({ clave, datos }); },
        () => {
          if (!control.signal.aborted)
            setResultado({ clave, error: 'No se pudo buscar destinatarios.' });
        },
      );
    }, consulta ? 250 : 0);
    return () => { clearTimeout(espera); control.abort(); };
  }, [activa, clave, token, consulta, v.oficina]);
  const actual = activa && resultado?.clave === clave ? resultado : undefined;
  const cambio = (p: Partial<Destino>) => cambiar({ ...v, ...p });
  const personas = actual?.datos?.personas ?? [];
  const opcionActiva = abierto && personas[indice] ? listaId + '-' + indice : undefined;
  useEffect(() => {
    if (opcionActiva) document.getElementById(opcionActiva)?.scrollIntoView({ block: 'nearest' });
  }, [opcionActiva]);
  const elegir = (persona: (typeof personas)[number]) => {
    cambio({ usuario: persona.id, etiqueta: persona.nombre + ' · ' + persona.nombre_usuario });
    setAbierto(false);
    setIndice(-1);
  };
  return (
    <div className={styles.datos}>
      <label className={styles.campo}>
        Persona destinataria
        <select
          value={v.modo}
          onChange={(e) => { setTexto(''); cambio({ modo: e.target.value, oficina: '', usuario: '', etiqueta: '', nombre: '' }); }}
        >
          <option value="usuario">Usuario registrado</option>
          <option value="manual">Persona sin cuenta</option>
        </select>
      </label>
      {v.modo === 'usuario' ? (
        <>
          <label className={styles.campo}>
            Oficina opcional
            <select
              value={v.oficina}
              onChange={(e) => { setIndice(-1); cambio({ oficina: e.target.value, usuario: '', etiqueta: '' }); }}
            >
              <option value="">Todas las oficinas</option>
              {opciones.oficinas
                .filter((o) => o.id !== opciones.oficina_actual_id)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
            </select>
          </label>
          <div className={styles.selectorPersona}>
            <label className={styles.campo}>
              Usuario
              <input
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={abierto}
                aria-controls={abierto ? listaId : undefined}
                aria-activedescendant={opcionActiva}
                autoComplete="off"
                maxLength={100}
                placeholder="Elige o escribe un nombre"
                value={v.usuario ? v.etiqueta : texto}
                onFocus={(e) => { setAbierto(true); if (v.usuario) e.currentTarget.select(); }}
                onClick={() => { setAbierto(true); if (resultado?.clave === clave && resultado.error) setIntento((n) => n + 1); }}
                onBlur={() => setAbierto(false)}
                onChange={(e) => {
                  setTexto(e.target.value);
                  setAbierto(true);
                  setIndice(-1);
                  cambio({ usuario: '', etiqueta: '' });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && abierto) {
                    e.preventDefault();
                    setAbierto(false);
                  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    setAbierto(true);
                    if (personas.length)
                      setIndice((i) => e.key === 'ArrowDown'
                        ? Math.min(i + 1, personas.length - 1)
                        : i < 0 ? personas.length - 1 : Math.max(i - 1, 0));
                  } else if (e.key === 'Enter' && abierto) {
                    e.preventDefault();
                    if (personas[indice]) elegir(personas[indice]);
                  }
                }}
              />
            </label>
            {abierto && (
              <div className={styles.coincidenciasPersona}>
                <div id={listaId} role="listbox" aria-label="Personas coincidentes">
                  {personas.map((u, i) => (
                    <div
                      key={u.id}
                      id={listaId + '-' + i}
                      role="option"
                      aria-selected={i === indice}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => elegir(u)}
                    >
                      {u.nombre} · {u.nombre_usuario} · {u.oficina ?? 'Sin oficina'}
                    </div>
                  ))}
                </div>
                {v.usuario && <p>Persona seleccionada. Edita el nombre para buscar otra.</p>}
                {activa && !actual && <p role="status">Buscando destinatarios…</p>}
                {actual?.error && (
                  <p role="alert">{actual.error} Vuelve a escribir o abre el selector de nuevo.</p>
                )}
                {actual?.datos?.personas.length === 0 && <p role="status">No se encontraron personas.</p>}
                {actual?.datos?.hay_mas && <p role="status">Hay más personas. Escribe para acotar la búsqueda.</p>}
              </div>
            )}
          </div>
        </>
      ) : (
        <label className={styles.campo}>
          Nombre de la persona
          <input
            required
            maxLength={250}
            value={v.nombre}
            onChange={(e) => cambio({ nombre: e.target.value })}
          />
        </label>
      )}
      <label className={styles.campo}>
        Observaciones opcionales
        <textarea
          maxLength={20000}
          value={v.observaciones}
          onChange={(e) => cambio({ observaciones: e.target.value })}
        />
      </label>
    </div>
  );
}
