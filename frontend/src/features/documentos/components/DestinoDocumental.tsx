import type { OpcionesActuales } from '../../../api/documental';
import styles from '../../../components/ui/Admin.module.css';
export const destinoVacio = { modo: 'usuario', oficina: '', usuario: '', nombre: '', observaciones: '' };
export type Destino = typeof destinoVacio;
export function datosDestino(v: Destino) {
    if (v.modo === 'usuario' && !v.usuario)
        throw Error('Selecciona una persona registrada.');
    if (v.modo === 'manual' && !v.nombre.trim())
        throw Error('Escribe el nombre de la persona.');
    return { oficina_id: v.modo === 'usuario' ? v.oficina || null : null, usuario_id: v.modo === 'usuario' ? v.usuario : null, nombre: v.modo === 'manual' ? v.nombre.trim() : null, observaciones: v.observaciones.trim() || null };
}
export function DestinoDocumental({ valor: v, cambiar, opciones }: {
    valor: Destino;
    cambiar: (d: Destino) => void;
    opciones: OpcionesActuales;
}) {
    const cambio = (p: Partial<Destino>) => cambiar({ ...v, ...p });
    return <div className={styles.datos}>
 <label className={styles.campo}>Persona destinataria<select value={v.modo} onChange={e => cambio({ modo: e.target.value, oficina: '', usuario: '', nombre: '' })}><option value="usuario">Usuario registrado</option><option value="manual">Persona sin cuenta</option></select></label>
 {v.modo === 'usuario' ? <>
 <label className={styles.campo}>Oficina opcional<select value={v.oficina} onChange={e => cambio({ oficina: e.target.value, usuario: '' })}><option value="">Todas las oficinas</option>{opciones.oficinas.filter(o => opciones.destinatarios.some(u => u.oficina_id === o.id)).map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></label>
 <label className={styles.campo}>Usuario<select required value={v.usuario} onChange={e => cambio({ usuario: e.target.value })}><option value="">Seleccionar persona</option>{opciones.destinatarios.filter(u => !v.oficina || u.oficina_id === v.oficina).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></label>
 </> : <label className={styles.campo}>Nombre de la persona<input required maxLength={250} value={v.nombre} onChange={e => cambio({ nombre: e.target.value })}/></label>}
 <label className={styles.campo}>Observaciones opcionales<textarea maxLength={20000} value={v.observaciones} onChange={e => cambio({ observaciones: e.target.value })}/></label>
 </div>;
}
