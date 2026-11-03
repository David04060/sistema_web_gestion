import { useState } from 'react';
import styles from '../../../components/ui/Admin.module.css';

export interface TipoEditable {
  id: string;
  nombre: string;
  prefijo: string;
  activo: boolean;
  en_uso: boolean;
}

/** Un prefijo usado identifica códigos históricos; solo el nombre y la actividad pueden cambiar. */
export function TipoDocumentalForm({ inicial, ocupado, guardar, cancelar }: {
  inicial?: TipoEditable;
  ocupado: boolean;
  guardar: (datos: { nombre: string; prefijo: string; activo: boolean; motivo: string }) => void;
  cancelar: () => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [prefijo, setPrefijo] = useState(inicial?.prefijo ?? '');
  const [activo, setActivo] = useState(inicial?.activo ?? true);
  const [motivo, setMotivo] = useState('');
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      guardar({ nombre: nombre.trim(), prefijo: prefijo.trim().toUpperCase(), activo, motivo: motivo.trim() });
    }}>
      <fieldset disabled={ocupado} className={styles.formularioTipo}>
        <legend>{inicial ? 'Editar tipo documental' : 'Añadir tipo documental'}</legend>
        <div className={styles.datos}>
          <label className={styles.campo}>Nombre
            <input required maxLength={250} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label className={styles.campo}>Prefijo (2–8 letras)
            <input required pattern="[A-Z]{2,8}" minLength={2} maxLength={8}
              disabled={inicial?.en_uso} value={prefijo}
              onChange={(e) => setPrefijo(e.target.value.toUpperCase())} />
          </label>
        </div>
        {inicial && <>
          <p>Los documentos anteriores conservan su nombre y código históricos.
            {inicial.en_uso && ' El prefijo ya está en uso y no puede cambiarse.'}</p>
          <label><input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Activo para nuevos registros</label>
          <label className={styles.campo}>Motivo del cambio
            <input required maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
        </>}
        <div className={styles.acciones}>
          <button className={styles.boton} type="submit">{ocupado ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Añadir tipo'}</button>
          {inicial && <button type="button" onClick={cancelar}>Cancelar</button>}
        </div>
      </fieldset>
    </form>
  );
}
