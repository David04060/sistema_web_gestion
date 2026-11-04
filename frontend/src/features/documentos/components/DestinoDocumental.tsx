import { useEffect, useState } from 'react';
import { api } from '../../../api/documental';
import type { OpcionesActuales } from '../../../api/documental';
import styles from '../../../components/ui/Admin.module.css';
export const destinoVacio = {
  modo: 'usuario',
  oficina: '',
  usuario: '',
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
  const [intento, setIntento] = useState(0);
  const consulta = texto.trim();
  const activa = v.modo === 'usuario' && consulta.length >= 2;
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
    }, 250);
    return () => { clearTimeout(espera); control.abort(); };
  }, [activa, clave, token, consulta, v.oficina]);
  const actual = activa && resultado?.clave === clave ? resultado : undefined;
  const cambio = (p: Partial<Destino>) => cambiar({ ...v, ...p });
  return (
    <div className={styles.datos}>
      <label className={styles.campo}>
        Persona destinataria
        <select
          value={v.modo}
          onChange={(e) => { setTexto(''); cambio({ modo: e.target.value, oficina: '', usuario: '', nombre: '' }); }}
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
              onChange={(e) => cambio({ oficina: e.target.value, usuario: '' })}
            >
              <option value="">Todas las oficinas</option>
              {opciones.oficinas
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
            </select>
          </label>
          <label className={styles.campo}>
            Buscar por nombre
            <input
              type="search"
              maxLength={100}
              value={texto}
              onChange={(e) => { setTexto(e.target.value); cambio({ usuario: '' }); }}
            />
          </label>
          {!activa && <p>Escribe al menos dos caracteres.</p>}
          {activa && !actual && <p role="status">Buscando destinatarios…</p>}
          {actual?.error && (
            <div role="alert">
              <p>{actual.error}</p>
              <button type="button" onClick={() => setIntento((n) => n + 1)}>Reintentar</button>
            </div>
          )}
          {actual?.datos?.personas.length === 0 && <p role="status">No se encontraron personas.</p>}
          {actual?.datos?.hay_mas && <p role="status">Se muestran 20 resultados. Precisa el nombre.</p>}
          <label className={styles.campo}>
            Usuario
            <select required value={v.usuario} onChange={(e) => cambio({ usuario: e.target.value })}>
              <option value="">Seleccionar persona</option>
              {actual?.datos?.personas.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre} · {u.nombre_usuario} · {u.oficina ?? 'Sin oficina'}
                </option>
              ))}
            </select>
          </label>
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
