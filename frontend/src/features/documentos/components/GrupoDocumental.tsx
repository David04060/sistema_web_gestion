import { Link } from 'react-router-dom';
import type { DocumentoActual } from '../../../api/documental';
import { fechaLocal } from '../../../lib/fechas';
import styles from '../../../components/ui/Admin.module.css';

export function GrupoDocumental({ documento: d }: { documento: DocumentoActual }) {
  return <section className={styles.tarjeta}>
    <h2>Documentos relacionados</h2>
    {d.grupo && (d.grupo.documentos.length > 1 || !d.grupo.inicio_visible) ? <>
      <p>Secuencia de registros relacionados. Cada documento conserva su código y autor.</p>
      {!d.grupo.inicio_visible && <p>Documento inicial no disponible con tus permisos.</p>}
      <ol>{d.grupo.documentos.map((v) => <li key={v.id}>
        {v.id === d.grupo?.primero_id && <strong>Primer documento registrado: </strong>}
        {v.id === d.id ? <strong>{v.codigo_visible} (documento actual)</strong> : <Link to={'/documentos/' + v.id}>{v.codigo_visible}</Link>}
        {' — '}{v.asunto} · {fechaLocal(v.creado_en)}
      </li>)}</ol>
    </> : d.relacionados.length ? <ul>{d.relacionados.map((v) => <li key={v.id}>
      <Link to={'/documentos/' + v.id}>{v.codigo_visible}</Link> — {v.asunto}
    </li>)}</ul> : <p>Sin documentos relacionados.</p>}
  </section>;
}
