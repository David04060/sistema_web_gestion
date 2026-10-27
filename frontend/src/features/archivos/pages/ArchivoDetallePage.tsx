import { useCallback } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { fechaLocal } from '../../../lib/fechas';
import { CabeceraArchivos } from '../components/CabeceraArchivos';
import { PaginacionArchivos } from '../components/PaginacionArchivos';
import * as api from '../api/archivos.api';
import base from '../../../components/ui/Admin.module.css';
import styles from '../styles/Archivos.module.css';
/** Presenta nombres y hechos administrativos; no consulta contenido documental. */
export function ArchivoDetallePage() {
    const { id = '' } = useParams();
    const token = useAuth().sesion!.token;
    const location = useLocation();
    const mensaje: unknown = location.state?.mensaje;
    const [params, setParams] = useSearchParams();
    const query = new URLSearchParams({ pagina: params.get('historial_pagina') ?? '1', limite: params.get('historial_limite') ?? '10' }).toString();
    const consulta = useConsulta(useCallback(() => api.detalle(token, id), [token, id]));
    const historial = useConsulta(useCallback(() => api.asignaciones(token, id, query), [token, id, query]));
    const a = consulta.datos?.archivo;
    return <main className={`${base.pagina} ${styles.modulo}`}>
        <CabeceraArchivos titulo="Detalle del archivo institucional" descripcion="Pertenencia institucional y responsabilidad administrativa." />
        {typeof mensaje === 'string' && <p className={base.exito} role="status">{mensaje}</p>}
        <EstadoCarga {...consulta} reintentar={consulta.recargar} />
        {a && <><section className={base.tarjeta}><h2>{a.nombre}</h2><dl className={base.datos}>
            <div className={styles.amplio}><dt>Responsabilidad o finalidad</dt><dd className={styles.texto}>{a.responsabilidad}</dd></div>
            <div><dt>Oficina</dt><dd>{a.oficina}</dd></div><div><dt>Responsable vigente</dt><dd>{a.responsable}</dd></div>
            <div><dt>Creado por</dt><dd>{a.creador}</dd></div><div><dt>Fecha del registro</dt><dd>{fechaLocal(a.fecha_creacion)}</dd></div>
            <div className={styles.amplio}><dt>Motivo administrativo registrado</dt><dd className={styles.texto}>{a.motivo}</dd></div>
        </dl><div className={base.acciones}><Link className={base.boton} to={`/archivos/${a.id}/editar`}>Corregir nombre o responsabilidad</Link><Link className={base.secundario} to="/archivos">Volver al listado</Link></div></section>
            <section className={base.tarjeta}><h2>Historial de asignaciones</h2><p>Períodos de responsabilidad del archivo. Esta pantalla no cambia responsables.</p>
                <EstadoCarga {...historial} reintentar={historial.recargar} />
                {historial.datos && <>{historial.datos.asignaciones.length ? <div className={styles.tabla} role="region" aria-label="Tabla del historial de asignaciones" tabIndex={0}><table><caption>Asignaciones del archivo</caption><thead><tr><th scope="col">Responsable</th><th scope="col">Período</th><th scope="col">Formalización y motivo</th></tr></thead><tbody>{historial.datos.asignaciones.map(s => <tr key={s.id}><td>{s.responsable}</td><td>Desde {fechaLocal(s.fecha_inicio)}<br />{s.fecha_fin ? `Hasta ${fechaLocal(s.fecha_fin)}` : 'Asignación vigente'}</td><td>{s.formalizador}<p className={styles.texto}>{s.motivo}</p>{s.fecha_fin && <p>Finalización: {s.finalizador ?? 'Sin nombre disponible'} · {s.motivo_fin}</p>}</td></tr>)}</tbody></table></div> : <p className={base.vacio}>No hay asignaciones en esta página.</p>}
                    <PaginacionArchivos {...historial.datos} nombre="asignaciones" cambiar={(pagina, limite) => { const p = new URLSearchParams(params); p.set('historial_pagina', String(pagina)); p.set('historial_limite', String(limite)); setParams(p); }} /></>}
            </section></>}
    </main>;
}
